-- Let supervisors correct flats they added by hand.
-- Applied to the live project as migration `manual_flat_supervisor_edit_delete`.
-- Owner access is unchanged; these policies are additive.

drop policy if exists "site_flats_supervisor_update_manual" on site_flats;
create policy "site_flats_supervisor_update_manual"
  on site_flats
  for update
  to authenticated
  using (auth_role() = 'supervisor' and source = 'manual')
  with check (auth_role() = 'supervisor' and source = 'manual');

drop policy if exists "site_flats_supervisor_delete_manual" on site_flats;
create policy "site_flats_supervisor_delete_manual"
  on site_flats
  for delete
  to authenticated
  using (
    auth_role() = 'supervisor'
    and source = 'manual'
    and not exists (
      select 1 from meter_records r where r.site_flat_id = site_flats.id
    )
  );
