-- Доступность и атомарное создание брони

create sequence if not exists public.booking_code_seq start 1;

-- сколько единиц каждого товара свободно в городе на период (гостю видны только числа)
create or replace function public.availability(p_city text, p_start timestamptz, p_end timestamptz)
returns table (product_id text, total int, free int)
language sql stable security definer set search_path = public as $$
  select u.product_id,
         count(*)::int as total,
         count(*) filter (where not exists (
           select 1 from public.booking_units bu
            where bu.unit_id = u.id and bu.active and bu.during && tstzrange(p_start, p_end, '[)')
         ))::int as free
    from public.product_units u
   where u.city = p_city and not u.maintenance and u.condition <> 'repair'
   group by u.product_id
$$;

-- создать бронь: выбрать свободные единицы, посчитать цену, записать — всё в одной транзакции.
-- Если кто-то успел забрать единицу параллельно, сработает ограничение booking_units_no_overlap → ошибка «занято».
create or replace function public.create_booking(
  p_city text, p_start timestamptz, p_end timestamptz,
  p_items jsonb,                -- [{"product_id": "...", "qty": 1}]
  p_payment_method text default 'kaspi', p_delivery_type text default 'pickup',
  p_address text default null, p_comment text default null, p_promo text default null
) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_customer public.customers;
  v_days int := greatest(1, ceil(extract(epoch from (p_end - p_start)) / 86400.0)::int);
  v_item jsonb; v_product public.products; v_units text[]; v_need int;
  v_subtotal int := 0; v_tier int := 0; v_promo int := 0; v_pct int; v_delivery int := 0; v_deposit int := 0;
  v_settings public.settings; v_booking public.bookings; v_code text;
begin
  select * into v_customer from public.customers where user_id = auth.uid();
  if v_customer.id is null then raise exception 'Войдите, чтобы оформить бронь' using errcode = '28000'; end if;
  if v_customer.blacklisted then raise exception 'Не получилось оформить онлайн. Позвоните нам.'; end if;
  if p_end <= p_start then raise exception 'Неверные даты'; end if;
  select * into v_settings from public.settings where id = 1;

  v_code := 'PX-' || (1000 + nextval('public.booking_code_seq'));
  insert into public.bookings (code, customer_id, city, start_at, end_at, days, payment_method, delivery_type, address, comment, source,
                               awaiting_verification, history)
  values (v_code, v_customer.id, p_city, p_start, p_end, v_days, p_payment_method, p_delivery_type, p_address, p_comment, 'app',
          v_customer.verification <> 'verified',
          jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Клиент', 'text',
            case when v_customer.verification <> 'verified' then 'Бронь создана · ждёт верификации профиля' else 'Бронь создана' end)))
  returning * into v_booking;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = v_item->>'product_id' and not hidden;
    if v_product.id is null then raise exception 'Товар не найден'; end if;
    v_need := greatest(1, (v_item->>'qty')::int);
    select array_agg(id) into v_units from (
      select u.id from public.product_units u
       where u.product_id = v_product.id and u.city = p_city and not u.maintenance and u.condition <> 'repair'
         and not exists (select 1 from public.booking_units bu where bu.unit_id = u.id and bu.active and bu.during && tstzrange(p_start, p_end, '[)'))
       order by u.id
       limit v_need
       for update skip locked
    ) x;
    if coalesce(array_length(v_units, 1), 0) < v_need then
      raise exception '%: на эти даты свободно %', v_product.name, coalesce(array_length(v_units, 1), 0) using errcode = 'P0001';
    end if;
    insert into public.booking_items (booking_id, product_id, qty, price) values (v_booking.id, v_product.id, v_need, v_product.price);
    insert into public.booking_units (booking_id, unit_id, during) select v_booking.id, unnest(v_units), tstzrange(p_start, p_end, '[)');
    v_subtotal := v_subtotal + v_product.price * v_need * v_days;
    v_deposit := v_deposit + v_product.deposit * v_need;
  end loop;

  select coalesce(max((t->>'percent')::int), 0) into v_tier from jsonb_array_elements(v_settings.tiers) t where (t->>'days')::int <= v_days;
  if p_promo is not null then
    select percent into v_promo from public.promos where upper(code) = upper(p_promo) and active;
    if found then update public.promos set uses = uses + 1 where upper(code) = upper(p_promo); end if;
  end if;
  v_pct := greatest(v_tier, coalesce(v_promo, 0));
  if p_delivery_type = 'delivery' then v_delivery := coalesce((v_settings.delivery_fee->>p_city)::int, 0); end if;

  update public.bookings set
    subtotal = v_subtotal, discount = round(v_subtotal * v_pct / 100.0), promo = case when v_promo > v_tier then upper(p_promo) end,
    delivery = v_delivery, total = v_subtotal - round(v_subtotal * v_pct / 100.0) + v_delivery,
    deposit = case when v_settings.deposit_for_new and v_customer.verification <> 'verified' then v_deposit else 0 end
  where id = v_booking.id returning * into v_booking;

  insert into public.notifications (kind, title, body, ref)
  values ('booking', 'Новая бронь ' || v_booking.code, v_customer.name, v_booking.id);
  return v_booking;
exception
  when exclusion_violation then raise exception 'Кто-то только что забронировал эту технику — обновите даты' using errcode = 'P0001';
end $$;

-- клиент отменяет свою будущую бронь
create or replace function public.cancel_my_booking(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set status = 'cancelled', history = history || jsonb_build_object('at', now(), 'by', 'Клиент', 'text', 'Отменена клиентом')
   where id = p_id and customer_id = public.my_customer_id() and status in ('new', 'confirmed') and start_at > now();
  if not found then raise exception 'Эту бронь уже нельзя отменить'; end if;
end $$;

-- менеджер подтверждает/отклоняет профиль; подтверждение снимает пометку с броней
create or replace function public.review_customer(p_id text, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff := public.current_staff();
begin
  if not public.has_permission('verify') then raise exception 'Нет прав на проверку документов'; end if;
  update public.customers set verification = case when p_ok then 'verified' else 'rejected' end,
         reject_reason = case when p_ok then null else p_reason end, reviewed_at = now(), reviewed_by = v_staff.id
   where id = p_id;
  if p_ok then update public.bookings set awaiting_verification = false where customer_id = p_id and awaiting_verification; end if;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, case when p_ok then 'Профиль подтверждён' else 'Профиль отклонён: ' || coalesce(p_reason, '') end, p_id);
end $$;

-- новый скан → уведомление сотрудникам
create or replace function public.notify_scan() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, ref)
  select 'verification', 'Проверить документы: ' || c.name, c.id from public.customers c where c.id = new.customer_id and new.side = 'back';
  return new;
end $$;
create trigger id_scans_notify after insert on public.id_scans for each row execute function public.notify_scan();

create or replace function public.notify_lead() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, body, ref) values ('lead', 'Заявка: ' || new.name, left(new.text, 140), new.id);
  return new;
end $$;
create trigger leads_notify after insert on public.leads for each row execute function public.notify_lead();

-- занятость единиц без персональных данных: чтобы каталог у гостя показывал «свободно / занято до …»
create or replace function public.busy_periods(p_from timestamptz, p_to timestamptz)
returns table (unit_id text, start_at timestamptz, end_at timestamptz, issued boolean)
language sql stable security definer set search_path = public as $$
  select bu.unit_id, lower(bu.during), upper(bu.during), b.status = 'issued'
    from public.booking_units bu join public.bookings b on b.id = bu.booking_id
   where bu.active and bu.during && tstzrange(p_from, p_to, '[)')
$$;
