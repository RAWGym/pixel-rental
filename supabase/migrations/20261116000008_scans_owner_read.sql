-- Загрузка скана с перезаписью (upsert) требует, чтобы владелец мог прочитать свой файл.
-- Читать можно только свою папку {auth.uid()}/; чужие сканы видят лишь проверяющие (scans_verify_read).
create policy scans_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'id-scans' and (storage.foldername(name))[1] = auth.uid()::text);

-- upsert записи о скане (insert … on conflict do update) требует SELECT на свою строку
create policy scans_owner_select on public.id_scans for select using (customer_id = private.my_customer_id());
