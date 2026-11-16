-- Row Level Security: всё закрыто по умолчанию, открываем точечно

alter table public.roles enable row level security;
alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.settings enable row level security;
alter table public.promos enable row level security;
alter table public.banners enable row level security;
alter table public.customers enable row level security;
alter table public.id_scans enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.booking_units enable row level security;
alter table public.leads enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

-- каталог: читают все (гости тоже), скрытые товары — только сотрудники
create policy categories_read on public.categories for select using (true);
create policy products_read on public.products for select using (not hidden or public.is_staff());
create policy units_read on public.product_units for select using (true);
create policy settings_read on public.settings for select using (true);
create policy banners_read on public.banners for select using ((active and (ends_at is null or ends_at > now())) or public.is_staff());

create policy categories_write on public.categories for all using (public.has_permission('products.edit')) with check (public.has_permission('products.edit'));
create policy products_write on public.products for all using (public.has_permission('products.edit')) with check (public.has_permission('products.edit'));
create policy units_write on public.product_units for all using (public.has_permission('units.edit')) with check (public.has_permission('units.edit'));
create policy settings_write on public.settings for update using (public.has_permission('settings'));
create policy banners_write on public.banners for all using (public.has_permission('settings')) with check (public.has_permission('settings'));
create policy promos_staff on public.promos for all using (public.has_permission('pricing.edit')) with check (public.has_permission('pricing.edit'));

-- сотрудники и роли
create policy roles_read on public.roles for select using (public.is_staff());
create policy roles_write on public.roles for all using (public.has_permission('staff')) with check (public.has_permission('staff'));
create policy staff_read on public.staff for select using (public.is_staff());
create policy staff_write on public.staff for all using (public.has_permission('staff')) with check (public.has_permission('staff'));

-- клиенты: свой профиль или сотрудник с правом «Клиенты»
create policy customers_own_read on public.customers for select using (user_id = auth.uid() or public.has_permission('customers'));
create policy customers_own_insert on public.customers for insert with check (user_id = auth.uid() and verification in ('none', 'pending'));
create policy customers_own_update on public.customers for update using (user_id = auth.uid() or public.has_permission('customers'));

-- сканы: клиент добавляет свои, читают только сотрудники с правом verify
create policy scans_insert on public.id_scans for insert with check (customer_id = public.my_customer_id());
create policy scans_update on public.id_scans for update using (customer_id = public.my_customer_id());
create policy scans_read on public.id_scans for select using (public.has_permission('verify'));

-- брони: клиент — только свои (создаёт через create_booking), сотрудники — по правам
create policy bookings_read on public.bookings for select using (customer_id = public.my_customer_id() or public.has_permission('bookings.view'));
create policy bookings_staff_write on public.bookings for update using (public.has_permission('bookings.edit'));
create policy bookings_staff_insert on public.bookings for insert with check (public.has_permission('bookings.edit'));
create policy items_read on public.booking_items for select using (exists (select 1 from public.bookings b where b.id = booking_id));
create policy items_staff on public.booking_items for all using (public.has_permission('bookings.edit')) with check (public.has_permission('bookings.edit'));
create policy bunits_read on public.booking_units for select using (public.is_staff() or exists (select 1 from public.bookings b where b.id = booking_id));
create policy bunits_staff on public.booking_units for all using (public.has_permission('bookings.edit')) with check (public.has_permission('bookings.edit'));

-- заявки: оставить может любой (гость), видят сотрудники с правом «Заявки»
create policy leads_insert on public.leads for insert with check (status = 'new');
create policy leads_staff on public.leads for select using (public.has_permission('leads'));
create policy leads_staff_update on public.leads for update using (public.has_permission('leads'));

create policy audit_insert on public.audit_log for insert with check (public.is_staff());
create policy audit_read on public.audit_log for select using (public.has_permission('staff'));
create policy notif_read on public.notifications for select using (public.is_staff() and (staff_id is null or staff_id = (public.current_staff()).id));
create policy notif_update on public.notifications for update using (public.is_staff());

-- функции: гостю — только доступность
revoke all on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;
revoke all on function public.cancel_my_booking from public, anon;
grant execute on function public.cancel_my_booking to authenticated;
revoke all on function public.review_customer from public, anon;
grant execute on function public.review_customer to authenticated;
grant execute on function public.availability to anon, authenticated;
grant execute on function public.busy_periods to anon, authenticated;

-- ---------- хранилище ----------
insert into storage.buckets (id, name, public) values ('product-photos', 'product-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('id-scans', 'id-scans', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;

-- bucket product-photos публичный: файлы отдаются по прямой ссылке, листинг не открываем
create policy photos_staff_write on storage.objects for insert with check (bucket_id = 'product-photos' and public.has_permission('products.edit'));
create policy photos_staff_update on storage.objects for update using (bucket_id = 'product-photos' and public.has_permission('products.edit'));
create policy photos_staff_delete on storage.objects for delete using (bucket_id = 'product-photos' and public.has_permission('products.edit'));

-- сканы: клиент кладёт в папку со своим user_id, читать могут только проверяющие
create policy scans_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'id-scans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy scans_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'id-scans' and (storage.foldername(name))[1] = auth.uid()::text);
create policy scans_verify_read on storage.objects for select
  using (bucket_id = 'id-scans' and public.has_permission('verify'));
