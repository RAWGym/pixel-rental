-- Залог больше не используется: итог брони = аренда со скидкой + доставка.
-- Шаг 1: функции перестают считать залог, договор v2. Новая версия договора без пунктов о залоге.

create or replace function public.create_booking(p_city text, p_start timestamptz, p_end timestamptz, p_items jsonb, p_payment_method text default 'kaspi', p_delivery_type text default 'pickup', p_address text default null, p_comment text default null, p_promo text default null)
returns public.bookings
language plpgsql security definer set search_path = public as $$
declare
  v_customer public.customers;
  v_days int := greatest(1, ceil(extract(epoch from (p_end - p_start)) / 86400.0)::int);
  v_item jsonb; v_product public.products; v_units text[]; v_need int;
  v_subtotal int := 0; v_tier int := 0; v_promo int := 0; v_pct int; v_delivery int := 0;
  v_settings public.settings; v_booking public.bookings; v_code text;
begin
  select * into v_customer from public.customers where user_id = auth.uid();
  if v_customer.id is null then raise exception 'Войдите, чтобы оформить бронь' using errcode = '28000'; end if;
  if v_customer.blacklisted then raise exception 'Не получилось оформить онлайн. Позвоните нам.'; end if;
  if p_end <= p_start then raise exception 'Неверные даты'; end if;
  select * into v_settings from public.settings where id = 1;

  v_code := 'PX-' || (1000 + nextval('public.booking_code_seq'));
  insert into public.bookings (code, customer_id, city, start_at, end_at, days, payment_method, delivery_type, address, comment, source, awaiting_verification, history)
  values (v_code, v_customer.id, p_city, p_start, p_end, v_days, p_payment_method, p_delivery_type, p_address, p_comment, 'app',
          v_customer.verification <> 'verified',
          jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Клиент', 'text',
            case when v_customer.verification <> 'verified' then 'Бронь создана, ждёт проверки профиля' else 'Бронь создана' end)))
  returning * into v_booking;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = v_item->>'product_id' and not hidden;
    if v_product.id is null then raise exception 'Товар не найден'; end if;
    v_need := greatest(1, (v_item->>'qty')::int);
    select array_agg(id) into v_units from (
      select u.id from public.product_units u
       where u.product_id = v_product.id and u.city = p_city and not u.maintenance and u.condition <> 'repair'
         and not exists (select 1 from public.booking_units bu where bu.unit_id = u.id and bu.active and bu.during && tstzrange(p_start, p_end, '[)'))
       order by u.id limit v_need for update skip locked) x;
    if coalesce(array_length(v_units, 1), 0) < v_need then
      raise exception '%: на эти даты свободно %', v_product.name, coalesce(array_length(v_units, 1), 0) using errcode = 'P0001';
    end if;
    insert into public.booking_items (booking_id, product_id, qty, price) values (v_booking.id, v_product.id, v_need, v_product.price);
    insert into public.booking_units (booking_id, unit_id, during) select v_booking.id, unnest(v_units), tstzrange(p_start, p_end, '[)');
    v_subtotal := v_subtotal + v_product.price * v_need * v_days;
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
    delivery = v_delivery, total = v_subtotal - round(v_subtotal * v_pct / 100.0) + v_delivery
  where id = v_booking.id returning * into v_booking;

  insert into public.notifications (kind, title, body, ref) values ('booking', 'Новая бронь ' || v_booking.code, v_customer.name, v_booking.id);
  return v_booking;
exception
  when exclusion_violation then raise exception 'Кто-то только что забронировал эту технику. Обновите даты.' using errcode = 'P0001';
end $$;
revoke all on function public.create_booking from public, anon;
grant execute on function public.create_booking to authenticated;

create or replace function public.issue_booking(
  p_booking_id text, p_signer_name text, p_signature_path text, p_signature_sha256 text,
  p_strokes jsonb default null, p_checklist jsonb default '{}', p_unit_ids text[] default null,
  p_override boolean default false, p_user_agent text default null
) returns public.booking_contracts
language plpgsql security definer set search_path = public as $$
declare
  v_staff public.staff := private.current_staff();
  v_b public.bookings; v_c public.customers; v_t public.contract_templates;
  v_snapshot jsonb; v_terms_hash text; v_doc_hash text; v_ip text; v_row public.booking_contracts;
  v_item record; v_have int;
begin
  if v_staff.id is null or not private.has_permission('issue') then raise exception 'Нет прав на выдачу техники'; end if;
  select * into v_b from public.bookings where id = p_booking_id for update;
  if v_b.id is null then raise exception 'Бронь не найдена'; end if;
  if v_b.status not in ('new', 'confirmed') then raise exception 'Бронь % уже в статусе «%»', v_b.code, v_b.status; end if;
  select * into v_c from public.customers where id = v_b.customer_id;
  if v_c.blacklisted then raise exception 'Клиент в чёрном списке, выдача запрещена'; end if;
  if v_c.verification <> 'verified' then
    if not p_override then raise exception 'Профиль клиента не подтверждён. Нужна проверка документов или разрешение менеджера.'; end if;
    if not private.has_permission('issue.override') then raise exception 'Нет права выдавать без проверенного профиля'; end if;
  end if;
  if length(coalesce(trim(p_signer_name), '')) < 2 then raise exception 'Укажите ФИО подписанта'; end if;
  if p_signature_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Неверный хэш подписи'; end if;
  if (storage.foldername(p_signature_path))[1] is distinct from v_b.id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'contract-signatures' and o.name = p_signature_path) then
    raise exception 'Файл подписи не найден';
  end if;

  if p_unit_ids is not null then
    for v_item in select product_id, sum(qty)::int qty from public.booking_items where booking_id = v_b.id group by 1 loop
      select count(*) into v_have from public.product_units u where u.id = any (p_unit_ids) and u.product_id = v_item.product_id and u.city = v_b.city;
      if v_have <> v_item.qty then raise exception 'Нужно выбрать % ед. для каждой позиции', v_item.qty; end if;
    end loop;
    if (select count(*) from public.product_units u where u.id = any (p_unit_ids)) <> (select coalesce(sum(qty), 0) from public.booking_items where booking_id = v_b.id) then
      raise exception 'Выбраны лишние единицы техники';
    end if;
    delete from public.booking_units where booking_id = v_b.id and unit_id <> all (p_unit_ids);
    insert into public.booking_units (booking_id, unit_id, during)
      select v_b.id, x, tstzrange(v_b.start_at, v_b.end_at, '[)') from unnest(p_unit_ids) x
      on conflict (booking_id, unit_id) do nothing;
  end if;
  if exists (select 1 from public.booking_units bu join public.product_units u on u.id = bu.unit_id where bu.booking_id = v_b.id and (u.maintenance or u.condition = 'repair')) then
    raise exception 'В брони есть единица на обслуживании. Замените её.';
  end if;

  select * into v_t from public.contract_templates order by version desc limit 1;
  v_snapshot := jsonb_build_object(
    'code', v_b.code, 'city', v_b.city, 'supplier', 'Pixel Rental',
    'customer', jsonb_build_object('id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'iin', v_c.iin, 'verification', v_c.verification),
    'start', v_b.start_at, 'end', v_b.end_at, 'days', v_b.days,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', p.name, 'qty', i.qty, 'price', i.price,
               'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'serial', u.serial) order by u.serial), '[]') from public.booking_units bu join public.product_units u on u.id = bu.unit_id
                         where bu.booking_id = v_b.id and u.product_id = i.product_id)) order by i.id), '[]')
              from public.booking_items i join public.products p on p.id = i.product_id where i.booking_id = v_b.id),
    'subtotal', v_b.subtotal, 'discount', v_b.discount, 'delivery', v_b.delivery, 'total', v_b.total, 'paid', v_b.paid,
    'payment_status', v_b.payment_status, 'payment_method', v_b.payment_method
  );
  v_terms_hash := encode(extensions.digest(v_t.body, 'sha256'), 'hex');
  v_doc_hash := encode(extensions.digest(v_t.body || E'\n' || v_snapshot::text || E'\n' || p_signature_sha256, 'sha256'), 'hex');
  begin v_ip := split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1); exception when others then v_ip := null; end;

  insert into public.booking_contracts (booking_id, code, version, terms, terms_sha256, snapshot, doc_sha256, signer_name, signature_path, signature_sha256,
    strokes, checklist, verified_override, issued_by, issued_by_name, user_agent, ip)
  values (v_b.id, v_b.code, v_t.version, v_t.body, v_terms_hash, v_snapshot, v_doc_hash, trim(p_signer_name), p_signature_path, p_signature_sha256,
    p_strokes, coalesce(p_checklist, '{}'), v_c.verification <> 'verified', v_staff.id, v_staff.name, left(p_user_agent, 300), nullif(v_ip, ''))
  returning * into v_row;

  update public.bookings set status = 'issued', issued_at = now(), manager_id = coalesce(manager_id, v_staff.id),
         history = history || jsonb_build_object('at', now(), 'by', split_part(v_staff.name, ' ', 1), 'text', 'Выдана клиенту, договор подписан')
   where id = v_b.id;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Выдача по договору' || case when v_row.verified_override then ' (без проверенного профиля, разрешил сотрудник)' else '' end, v_b.code);
  insert into public.notifications (kind, title, body, ref) values ('booking', 'Выдана ' || v_b.code, v_c.name || ' подписал договор', v_b.id);
  return v_row;
exception
  when exclusion_violation then raise exception 'Эта единица техники уже занята на эти даты';
end $$;
revoke all on function public.issue_booking from public, anon;
grant execute on function public.issue_booking to authenticated;

-- договор без залога: новая версия (старые подписанные договоры хранят свой текст)
insert into public.contract_templates (version, body) values (2, $t$Поставщик (Pixel Rental) передаёт, а Арендатор принимает во временное пользование технику, указанную в акте, на указанный срок.
1. Арендатор проверил комплектность и внешнее состояние техники при получении. Замечания внесены в акт.
2. Арендатор обязуется использовать технику бережно, по назначению, не передавать третьим лицам и вернуть её в срок в том же состоянии с учётом нормального износа.
3. Стоимость аренды указана в акте.
4. За просрочку возврата начисляется оплата за каждые начатые сутки по тарифу. При утрате или повреждении Арендатор возмещает стоимость ремонта или рыночную стоимость техники.
5. Риск случайной гибели и повреждения техники с момента выдачи до возврата несёт Арендатор.
6. Подписывая акт, Арендатор подтверждает согласие с условиями аренды и достоверность своих данных.$t$)
on conflict (version) do nothing;

-- колонки удаляет 20261116000013_drop_deposit_columns.sql — после выкладки кода, который их больше не пишет
