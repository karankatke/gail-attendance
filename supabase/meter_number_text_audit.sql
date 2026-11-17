-- Meter numbers are printed text (they can contain letters), not a numeric reading.
alter table public.meter_records
  alter column meter_reading type text using meter_reading::text;

-- Who last edited the record. created_by_profile_id still records who first added it.
alter table public.meter_records
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

create index if not exists meter_records_updated_by_idx
  on public.meter_records (updated_by_profile_id);
