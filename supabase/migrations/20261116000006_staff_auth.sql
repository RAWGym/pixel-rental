-- Вход сотрудников через Supabase Auth, привязка к ролям, брони из админки, realtime

-- Назначить владельца по email. Вызывается ТОЛЬКО владельцем проекта в SQL Editor (через API недоступно):
--   select private.bootstrap_owner('owner@example.com');
create or replace function private.bootstrap_owner(p_email text, p_role text default 'owner') returns text
language plpgsql security definer set search_path = public as $$
declare v_user auth.users; v_id text;
begin
  select * into v_user from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user.id is null then raise exception 'Нет пользователя с email % — сначала зарегистрируйтесь на /admin', p_email; end if;
  insert into public.staff (name, phone, role_id, user_id, active)
  values (coalesce(v_user.raw_user_meta_data->>'name', split_part(v_user.email, '@', 1)), v_user.phone, p_role, v_user.id, true)
  on conflict (user_id) do update set role_id = excluded.role_id, active = true
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.bootstrap_owner(text, text) from public, anon, authenticated;

-- кладовщик выдаёт и принимает технику (меняет статус брони), не имея полного права на редактирование
drop policy if exists bookings_staff_write on public.bookings;
create policy bookings_staff_write on public.bookings for update
  using (private.has_permission('bookings.edit') or private.has_permission('units.edit'));

-- бронь из админки (звонок, Instagram, пришли на точку): тот же подбор единиц и защита от двойной брони
create or replace function public.staff_create_booking(
  p_customer_id text, p_new_name text, p_new_phone text,
  p_city text, p_start timestamptz, p_end timestamptz, p_items jsonb, p_source text default 'phone'
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff := private.current_staff();
  v_cid text := p_customer_id;
  v_days int := greatest(1, ceil(extract(epoch from (p_end - p_start)) / 86400.0)::int);
  v_item jsonb; v_product public.products; v_units text[]; v_need int; v_subtotal int := 0; v_tier int := 0;
  v_settings public.settings; v_booking public.bookings;
begin
  if not private.has_permission('bookings.edit') then raise exception 'Нет прав на создание броней'; end if;
  if v_cid is null then
    insert into public.customers (name, phone, tags) values (p_new_name, p_new_phone, array['Новый'])
    on conflict (phone) do update set name = public.customers.name
    returning id into v_cid;
  end if;
  select * into v_settings from public.settings where id = 1;
  insert into public.bookings (code, customer_id, city, start_at, end_at, days, source, manager_id, status, history)
  values ('PX-' || (1000 + nextval('public.booking_code_seq')), v_cid, p_city, p_start, p_end, v_days, coalesce(p_source, 'phone'), v_staff.id, 'confirmed',
          jsonb_build_array(jsonb_build_object('at', now(), 'by', split_part(v_staff.name, ' ', 1), 'text', 'Бронь создана в админке')))
  returning * into v_booking;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = v_item->>'product_id';
    v_need := greatest(1, (v_item->>'qty')::int);
    select array_agg(id) into v_units from (
      select u.id from public.product_units u
       where u.product_id = v_product.id and u.city = p_city and not u.maintenance and u.condition <> 'repair'
         and not exists (select 1 from public.booking_units bu where bu.unit_id = u.id and bu.active and bu.during && tstzrange(p_start, p_end, '[)'))
       order by u.id limit v_need for update skip locked) x;
    if coalesce(array_length(v_units, 1), 0) < v_need then raise exception '%: на эти даты свободно %', v_product.name, coalesce(array_length(v_units, 1), 0); end if;
    insert into public.booking_items (booking_id, product_id, qty, price) values (v_booking.id, v_product.id, v_need, v_product.price);
    insert into public.booking_units (booking_id, unit_id, during) select v_booking.id, unnest(v_units), tstzrange(p_start, p_end, '[)');
    v_subtotal := v_subtotal + v_product.price * v_need * v_days;
  end loop;
  select coalesce(max((t->>'percent')::int), 0) into v_tier from jsonb_array_elements(v_settings.tiers) t where (t->>'days')::int <= v_days;
  update public.bookings set subtotal = v_subtotal, discount = round(v_subtotal * v_tier / 100.0), total = v_subtotal - round(v_subtotal * v_tier / 100.0)
   where id = v_booking.id returning * into v_booking;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Создана бронь', v_booking.code);
  return v_booking;
exception
  when exclusion_violation then raise exception 'Кто-то только что забронировал эту технику — обновите даты';
end $$;
revoke all on function public.staff_create_booking from public, anon;
grant execute on function public.staff_create_booking to authenticated;

-- живые обновления в админке: новые брони, заявки, клиенты на проверке
do $$ begin
  begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leads; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.customers; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
end $$;
