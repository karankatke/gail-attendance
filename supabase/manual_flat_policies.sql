-- Let supervisors correct flats they added by hand.
-- Run once in the Supabase SQL editor (or apply as a migration).
-- Existing owner access is unchanged; these policies are additive.

drop policy if exists "site_flats_supervisor_update_manual" on site_flats;
create policy "site_flats_supervisor_update_manual"
  on site_flats
  for update
  to authenticated
  using (
    source = 'manual'
    and exists (
      select 1 from profiles p
      where p.id = current_profile_id() and p.role = 'supervisor' and p.active
    )
  )
  with check (
    source = 'manual'
    and exists (
      select 1 from profiles p
      where p.id = current_profile_id() and p.role = 'supervisor' and p.active
    )
  );

drop policy if exists "site_flats_supervisor_delete_manual" on site_flats;
create policy "site_flats_supervisor_delete_manual"
  on site_flats
  for delete
  to authenticated
  using (
    source = 'manual'
    and exists (
      select 1 from profiles p
      where p.id = current_profile_id() and p.role = 'supervisor' and p.active
    )
    and not exists (
      select 1 from meter_records r where r.site_flat_id = site_flats.id
    )
  );
