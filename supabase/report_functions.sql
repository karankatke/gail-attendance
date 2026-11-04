-- Wage calculation used by Reports, Today and the budget.
-- Applied to the live project as migration `fix_report_rates_and_monthly_accrual`.
--
-- Rules:
--   * A worker uses their own rate when set, otherwise the role's base rate.
--   * Day pay: present = rate, half day = 50%, absent = 0. A pay_overrides row
--     for that worker+date replaces the calculated amount.
--   * Monthly salary is spread across the days of each month in the range,
--     capped at today (Asia/Kolkata), and only for months where the worker has
--     attendance. A single day is therefore month_rate / days_in_month, not the
--     whole salary.
--   * p_include_monthly is kept for compatibility but is ignored: monthly
--     workers are always included with the accrual above.

create or replace function public.worker_monthly_accrual(p_worker_id uuid, p_from date, p_to date)
returns numeric
language sql
stable
security invoker
set search_path to 'public'
as $$
  select coalesce(sum(
    (coalesce(w.month_rate, r.month_rate, 0) * d.days) / d.days_in_month
  ), 0)
  from workers w
  left join roles r on r.id = w.role_id
  cross join lateral (
    select
      m.month_start,
      m.month_end,
      (least(p_to, m.month_end, (now() at time zone 'Asia/Kolkata')::date) - greatest(p_from, m.month_start) + 1) as days,
      (m.month_end - m.month_start + 1) as days_in_month
    from (
      select date_trunc('month', g)::date as month_start,
             (date_trunc('month', g) + interval '1 month - 1 day')::date as month_end
      from generate_series(p_from, p_to, interval '1 month') g
    ) m
    where least(p_to, m.month_end, (now() at time zone 'Asia/Kolkata')::date) >= greatest(p_from, m.month_start)
  ) d
  where w.id = p_worker_id
    and w.rate_mode = 'month'
    and exists (
      select 1 from attendance a
      where a.worker_id = w.id
        and a.work_date between d.month_start and d.month_end
        and a.status in ('present', 'half_day')
    )
    and p_to >= (
      select min(a.work_date) from attendance a
      where a.worker_id = w.id
        and a.work_date between d.month_start and d.month_end
        and a.status in ('present', 'half_day')
    );
$$;

create or replace function public.report_range(p_from date, p_to date, p_include_monthly boolean default false)
returns table (
  worker_id uuid,
  worker_name text,
  role_name text,
  rate_mode text,
  days_present integer,
  days_half integer,
  days_absent integer,
  total_hours numeric,
  gross_pay numeric,
  advances numeric,
  deductions numeric,
  bonuses numeric,
  net_pay numeric
)
language sql
stable
set search_path to 'public'
as $$
  with att as (
    select worker_id,
      count(*) filter (where status = 'present')::int  as dp,
      count(*) filter (where status = 'half_day')::int as dh,
      count(*) filter (where status = 'absent')::int   as da,
      coalesce(sum(hours), 0) as th
    from attendance where work_date between p_from and p_to group by worker_id
  ),
  daypay as (
    select a.worker_id,
      sum(coalesce(po.amount,
        case a.status
          when 'present'  then coalesce(w.day_rate, r.day_rate, 0)
          when 'half_day' then coalesce(w.day_rate, r.day_rate, 0) / 2
          else 0
        end)) as wage
    from attendance a
    join workers w on w.id = a.worker_id
    left join roles r on r.id = w.role_id
    left join pay_overrides po on po.worker_id = a.worker_id and po.work_date = a.work_date
    where a.work_date between p_from and p_to
      and w.rate_mode = 'day'
      and a.status <> 'absent'
    group by a.worker_id
  ),
  adj as (
    select worker_id,
      coalesce(sum(amount) filter (where type = 'advance'), 0)   as adv,
      coalesce(sum(amount) filter (where type = 'deduction'), 0) as ded,
      coalesce(sum(amount) filter (where type = 'bonus'), 0)     as bon
    from advances where entry_date between p_from and p_to group by worker_id
  ),
  monthly as (
    select w.id as worker_id,
           public.worker_monthly_accrual(w.id, p_from, p_to) as wage
    from workers w
    where w.rate_mode = 'month' and w.active
  )
  select
    w.id, w.name, r.name, w.rate_mode,
    coalesce(att.dp, 0), coalesce(att.dh, 0), coalesce(att.da, 0), coalesce(att.th, 0),
    case
      when w.rate_mode = 'month' then coalesce(mo.wage, 0)
      else coalesce(daypay.wage, 0)
    end as gross_pay,
    coalesce(adj.adv, 0), coalesce(adj.ded, 0), coalesce(adj.bon, 0),
    (case
      when w.rate_mode = 'month' then coalesce(mo.wage, 0)
      else coalesce(daypay.wage, 0)
    end) - coalesce(adj.adv, 0) - coalesce(adj.ded, 0) + coalesce(adj.bon, 0) as net_pay
  from workers w
  left join roles r on r.id = w.role_id
  left join att on att.worker_id = w.id
  left join daypay on daypay.worker_id = w.id
  left join monthly mo on mo.worker_id = w.id
  left join adj on adj.worker_id = w.id
  where w.active
  order by w.name;
$$;

-- Site cost uses the same rates and spreads a monthly salary across the
-- worker's attended site-days in the range.
create or replace function public.report_by_location(p_from date, p_to date)
returns table (
  location_id uuid,
  location_name text,
  worker_days integer,
  total_hours numeric,
  gross_pay numeric
)
language sql
stable
set search_path to 'public'
as $$
  with days_per_worker as (
    select a.worker_id, count(*) as n
    from attendance a
    where a.work_date between p_from and p_to and a.status <> 'absent'
    group by a.worker_id
  ),
  monthly as (
    select w.id as worker_id,
           public.worker_monthly_accrual(w.id, p_from, p_to) as accrual
    from workers w
    where w.rate_mode = 'month' and w.active
  )
  select
    l.id, coalesce(l.name, 'Unassigned'),
    count(a.id)::int,
    coalesce(sum(a.hours), 0),
    coalesce(sum(
      case
        when w.rate_mode = 'day' then coalesce(po.amount,
          case a.status
            when 'present'  then coalesce(w.day_rate, r.day_rate, 0)
            when 'half_day' then coalesce(w.day_rate, r.day_rate, 0) / 2
            else 0
          end)
        when w.rate_mode = 'month' then coalesce(mo.accrual / nullif(dpw.n, 0), 0)
        else 0
      end
    ) filter (where a.status <> 'absent'), 0)
  from attendance a
  left join locations l on l.id = a.location_id
  join workers w on w.id = a.worker_id
  left join roles r on r.id = w.role_id
  left join pay_overrides po on po.worker_id = a.worker_id and po.work_date = a.work_date
  left join days_per_worker dpw on dpw.worker_id = a.worker_id
  left join monthly mo on mo.worker_id = a.worker_id
  where a.work_date between p_from and p_to
  group by l.id, l.name
  order by 5 desc;
$$;
