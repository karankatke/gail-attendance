-- ============================================================
--  Optional starter data. Edit names/rates before running.
--  Run AFTER schema.sql
-- ============================================================

insert into roles (name, day_rate, hour_rate) values
  ('Labour / Digger', 600, 80),
  ('Plumber',         900, 120),
  ('Electrician',     1000, 130),
  ('Helper',          500, 70)
on conflict do nothing;

insert into locations (name, address) values
  ('Site A', ''),
  ('Site B', '')
on conflict do nothing;

-- Example worker (delete or edit)
-- insert into workers (name, phone, role_id, rate_mode, day_rate)
-- select 'Ramesh', '', id, 'day', null from roles where name = 'Labour / Digger';
