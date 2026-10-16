-- ============================================================
--  Attendance Register - Supabase schema
--  Run this in Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Locations (work sites)
-- ------------------------------------------------------------
create table if not exists locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Roles / work types (Plumber, Labour, Electrician ...)
-- Base rates live here; a worker can override them.
-- ------------------------------------------------------------
create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  day_rate    numeric(12,2) not null default 0,
  hour_rate   numeric(12,2) not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- Workers
-- rate_mode: 'day' or 'hour'
-- day_rate / hour_rate: optional per-worker override (null = use role rate)
-- ------------------------------------------------------------
create table if not exists workers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  role_id     uuid references roles(id) on delete set null,
  rate_mode   text not null default 'day' check (rate_mode in ('day','hour')),
  day_rate    numeric(12,2),
  hour_rate   numeric(12,2),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists workers_role_idx on workers(role_id);

-- ------------------------------------------------------------
-- Attendance: one row per worker per day
-- status: 'present' | 'half_day' | 'absent'
-- pay_amount is stored (pre-filled from the rule, editable on the spot)
-- pay_overridden marks manual edits
-- ------------------------------------------------------------
create table if not exists attendance (
  id             uuid primary key default gen_random_uuid(),
  worker_id      uuid not null references workers(id) on delete cascade,
  work_date      date not null,
  location_id    uuid references locations(id) on delete set null,
  role_id        uuid references roles(id) on delete set null,
  status         text not null default 'present' check (status in ('present','half_day','absent')),
  hours          numeric(6,2),
  pay_amount     numeric(12,2) not null default 0,
  pay_overridden boolean not null default false,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (worker_id, work_date)
);

create index if not exists attendance_date_idx on attendance(work_date);
create index if not exists attendance_worker_idx on attendance(worker_id);
create index if not exists attendance_location_idx on attendance(location_id);

-- ------------------------------------------------------------
-- Advances / deductions / bonuses
-- type: 'advance' | 'deduction' | 'bonus'
-- ------------------------------------------------------------
create table if not exists advances (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references workers(id) on delete cascade,
  entry_date  date not null default current_date,
  type        text not null default 'advance' check (type in ('advance','deduction','bonus')),
  amount      numeric(12,2) not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists advances_worker_idx on advances(worker_id);
create index if not exists advances_date_idx on advances(entry_date);

-- ------------------------------------------------------------
-- updated_at trigger for attendance
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists attendance_set_updated_at on attendance;
create trigger attendance_set_updated_at
  before update on attendance
  for each row execute function set_updated_at();

-- ============================================================
--  Reporting function: per-worker totals for a date range
-- ============================================================
create or replace function report_range(p_from date, p_to date)
returns table (
  worker_id     uuid,
  worker_name   text,
  role_name     text,
  days_present  integer,
  days_half     integer,
  days_absent   integer,
  total_hours   numeric,
  gross_pay     numeric,
  advances      numeric,
  deductions    numeric,
  bonuses       numeric,
  net_pay       numeric
)
language sql stable security invoker
as $$
  with att as (
    select worker_id,
      count(*) filter (where status = 'present')  as days_present,
      count(*) filter (where status = 'half_day') as days_half,
      count(*) filter (where status = 'absent')   as days_absent,
      coalesce(sum(hours), 0)                     as total_hours,
      coalesce(sum(pay_amount) filter (where status <> 'absent'), 0) as gross_pay
    from attendance
    where work_date between p_from and p_to
    group by worker_id
  ),
  adj as (
    select worker_id,
      coalesce(sum(amount) filter (where type = 'advance'), 0)   as advances,
      coalesce(sum(amount) filter (where type = 'deduction'), 0) as deductions,
      coalesce(sum(amount) filter (where type = 'bonus'), 0)     as bonuses
    from advances
    where entry_date between p_from and p_to
    group by worker_id
  )
  select
    w.id,
    w.name,
    r.name,
    coalesce(att.days_present, 0)::int,
    coalesce(att.days_half, 0)::int,
    coalesce(att.days_absent, 0)::int,
    coalesce(att.total_hours, 0),
    coalesce(att.gross_pay, 0),
    coalesce(adj.advances, 0),
    coalesce(adj.deductions, 0),
    coalesce(adj.bonuses, 0),
    coalesce(att.gross_pay, 0) - coalesce(adj.advances, 0) - coalesce(adj.deductions, 0) + coalesce(adj.bonuses, 0)
  from workers w
  left join roles r on r.id = w.role_id
  left join att on att.worker_id = w.id
  left join adj on adj.worker_id = w.id
  where w.active
  order by w.name;
$$;

-- ============================================================
--  Reporting function: cost grouped by location for a range
-- ============================================================
create or replace function report_by_location(p_from date, p_to date)
returns table (
  location_id   uuid,
  location_name text,
  worker_days   integer,
  total_hours   numeric,
  gross_pay     numeric
)
language sql stable security invoker
as $$
  select
    l.id,
    coalesce(l.name, 'Unassigned'),
    count(a.id)::int,
    coalesce(sum(a.hours), 0),
    coalesce(sum(a.pay_amount) filter (where a.status <> 'absent'), 0)
  from attendance a
  left join locations l on l.id = a.location_id
  where a.work_date between p_from and p_to
  group by l.id, l.name
  order by coalesce(sum(a.pay_amount) filter (where a.status <> 'absent'), 0) desc;
$$;

-- ============================================================
--  Row Level Security: only the signed-in shared account can read/write.
--  Anonymous (link without PIN) gets nothing.
-- ============================================================
alter table locations  enable row level security;
alter table roles      enable row level security;
alter table workers    enable row level security;
alter table attendance enable row level security;
alter table advances   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['locations','roles','workers','attendance','advances'] loop
    execute format('drop policy if exists "authenticated_all" on %I', t);
    execute format(
      'create policy "authenticated_all" on %I for all to authenticated using (true) with check (true)', t
    );
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

grant execute on function report_range(date, date) to authenticated;
grant execute on function report_by_location(date, date) to authenticated;

-- Pin search_path (avoids the "function search path mutable" security lint)
alter function public.set_updated_at() set search_path = '';
alter function public.report_range(date, date) set search_path = public;
alter function public.report_by_location(date, date) set search_path = public;

-- ============================================================
--  Realtime: publish these tables so all phones stay in sync
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['locations','roles','workers','attendance','advances'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when others then
      null; -- already published
    end;
  end loop;
end $$;
