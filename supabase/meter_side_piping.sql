-- Meter side and total piping per flat.
-- LHS/RHS is optional at the DB level so a supervisor can save a partial
-- record and finish it later. The app marks the record pending until the
-- side and both pipe lengths are filled. Zero is not a valid pipe length.

alter table public.meter_records
  add column if not exists meter_side text,
  add column if not exists gi_pipe_length_m numeric(8,3),
  add column if not exists mlc_pipe_length_m numeric(8,3);

alter table public.meter_records drop constraint if exists meter_records_side_check;
alter table public.meter_records
  add constraint meter_records_side_check check (meter_side in ('LHS', 'RHS'));

alter table public.meter_records drop constraint if exists meter_records_pipe_positive;
alter table public.meter_records
  add constraint meter_records_pipe_positive check (
    (gi_pipe_length_m is null or gi_pipe_length_m > 0)
    and (mlc_pipe_length_m is null or mlc_pipe_length_m > 0)
  );
