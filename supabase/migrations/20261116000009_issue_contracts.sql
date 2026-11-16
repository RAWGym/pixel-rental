-- Выдача техники с подписью клиента: договор-акт на каждую выдачу.
-- Договор неизменяем: вставляется только функцией issue_booking, менять/удалять нельзя (кроме аннулирования владельцем через void_contract).
-- Бронь не может перейти в «Выдана» без подписанного договора (триггер bookings_require_contract).

-- ---------- права ----------
-- issue — выдавать и принимать технику; issue.override — выдать клиенту без подтверждённого профиля; contracts.void — аннулировать договор
update public.roles set permissions = array(select distinct unnest(permissions || array['issue', 'issue.override', 'contracts.void'])) where id = 'owner';
update public.roles set permissions = array(select distinct unnest(permissions || array['issue', 'issue.override'])) where id = 'manager';
update public.roles set permissions = array(select distinct unnest(permissions || array['issue'])) where id = 'warehouse';

-- ---------- шаблон договора (версии) ----------
create table public.contract_templates (
  version int primary key,
  body text not null check (length(body) between 50 and 20000),
  created_at timestamptz not null default now(),
  created_by text references public.staff(id)
);
alter table public.contract_templates enable row level security;
create policy ct_read on public.contract_templates for select using (private.is_staff());
-- новая версия = новая строка; старые не меняются
create policy ct_insert on public.contract_templates for insert with check (private.has_permission('settings'));

insert into public.contract_templates (version, body) values (1, $t$Поставщик (Pixel Rental) передаёт, а Арендатор принимает во временное пользование технику, указанную в акте, на указанный срок.
1. Арендатор проверил комплектность и внешнее состояние техники при получении; замечания внесены в акт.
2. Арендатор обязуется использовать технику бережно, по назначению, не передавать третьим лицам и вернуть её в срок в том же состоянии с учётом нормального износа.
3. Стоимость аренды и залог указаны в акте. Залог возвращается после приёмки техники без повреждений.
4. За просрочку возврата начисляется оплата за каждые начатые сутки по тарифу. При утрате или повреждении Арендатор возмещает стоимость ремонта или рыночную стоимость техники.
5. Риск случайной гибели и повреждения техники с момента выдачи до возврата несёт Арендатор.
6. Подписывая акт, Арендатор подтверждает согласие с условиями аренды и достоверность своих данных.$t$)
on conflict (version) do nothing;

-- ---------- договоры ----------
alter table public.bookings add column if not exists issued_at timestamptz;
alter table public.bookings add column if not exists returned_at timestamptz;
alter table public.bookings add column if not exists return_check jsonb;

create table public.booking_contracts (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id),
  code text not null,                         -- номер договора = код брони
  version int not null references public.contract_templates(version),
  terms text not null,                        -- текст условий на момент подписи
  terms_sha256 text not null,
  snapshot jsonb not null,                    -- стороны, техника с серийниками, период, суммы — на момент подписи
  doc_sha256 text not null,                   -- хэш условий + snapshot + подписи
  signer_name text not null,
  signature_path text not null,               -- bucket contract-signatures
  signature_sha256 text not null,
  strokes jsonb,                              -- вектор подписи (точки, время, давление)
  checklist jsonb not null default '{}',
  verified_override boolean not null default false,
  signed_at timestamptz not null default now(),
  issued_by text not null references public.staff(id),
  issued_by_name text not null,
  user_agent text,
  ip text,
  status text not null default 'signed' check (status in ('signed', 'void')),
  voided_at timestamptz,
  voided_by text references public.staff(id),
  void_reason text
);
create unique index booking_contracts_one_signed on public.booking_contracts (booking_id) where status = 'signed';
create index booking_contracts_booking_idx on public.booking_contracts (booking_id);
alter table public.booking_contracts enable row level security;
-- читают: сотрудники с правом выдачи/просмотра броней и сам клиент (только свои); писать напрямую нельзя никому
create policy contracts_read on public.booking_contracts for select using (
  private.has_permission('issue') or private.has_permission('bookings.view')
  or exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = private.my_customer_id())
);

-- неизменяемость: UPDATE только аннулирование через void_contract, DELETE запрещён
create or replace function private.guard_contract() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Договор нельзя удалить'; end if;
  if coalesce(current_setting('px.contract_void', true), '') <> '1'
     or old.status <> 'signed' or new.status <> 'void'
     or (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'void_reason']) <> (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'void_reason']) then
    raise exception 'Договор нельзя изменить';
  end if;
  return new;
end $$;
create trigger booking_contracts_guard before update or delete on public.booking_contracts for each row execute function private.guard_contract();

-- бронь переходит в «Выдана» только с подписанным договором
create or replace function private.require_contract() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'issued' and old.status is distinct from 'issued'
     and not exists (select 1 from public.booking_contracts c where c.booking_id = new.id and c.status = 'signed') then
    raise exception 'Выдача только с подписанным договором (раздел «Выдача»)';
  end if;
  return new;
end $$;
create trigger bookings_require_contract before update of status on public.bookings for each row execute function private.require_contract();

-- ---------- хранилище подписей ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-signatures', 'contract-signatures', false, 1048576, array['image/png']) on conflict (id) do nothing;
-- путь: {booking_id}/{uuid}.png; загружает сотрудник с правом выдачи, перезаписать/удалить нельзя
create policy sig_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'contract-signatures' and private.has_permission('issue'));
create policy sig_read on storage.objects for select to authenticated using (
  bucket_id = 'contract-signatures' and (
    private.has_permission('issue') or private.has_permission('bookings.view')
    or exists (select 1 from public.bookings b where b.id = (storage.foldername(name))[1] and b.customer_id = private.my_customer_id())
  )
);

-- ---------- выдача: одна атомарная операция ----------
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
  if v_c.blacklisted then raise exception 'Клиент в чёрном списке — выдача запрещена'; end if;
  if v_c.verification <> 'verified' then
    if not p_override then raise exception 'Профиль клиента не подтверждён — нужна проверка документов или подтверждение менеджера'; end if;
    if not private.has_permission('issue.override') then raise exception 'Нет права выдавать без проверенного профиля'; end if;
  end if;
  if length(coalesce(trim(p_signer_name), '')) < 2 then raise exception 'Укажите ФИО подписанта'; end if;
  if p_signature_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Неверный хэш подписи'; end if;
  if (storage.foldername(p_signature_path))[1] is distinct from v_b.id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'contract-signatures' and o.name = p_signature_path) then
    raise exception 'Файл подписи не найден';
  end if;

  -- замена единиц техники (выдали другой экземпляр той же модели); пересечения ловит exclusion constraint
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
    raise exception 'В брони есть единица на обслуживании — замените её';
  end if;

  select * into v_t from public.contract_templates order by version desc limit 1;
  v_snapshot := jsonb_build_object(
    'code', v_b.code, 'city', v_b.city,
    'supplier', 'Pixel Rental',
    'customer', jsonb_build_object('id', v_c.id, 'name', v_c.name, 'phone', v_c.phone, 'iin', v_c.iin, 'verification', v_c.verification),
    'start', v_b.start_at, 'end', v_b.end_at, 'days', v_b.days,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', p.name, 'qty', i.qty, 'price', i.price, 'deposit', p.deposit,
               'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'serial', u.serial) order by u.serial), '[]') from public.booking_units bu join public.product_units u on u.id = bu.unit_id
                         where bu.booking_id = v_b.id and u.product_id = i.product_id)) order by i.id), '[]')
              from public.booking_items i join public.products p on p.id = i.product_id where i.booking_id = v_b.id),
    'subtotal', v_b.subtotal, 'discount', v_b.discount, 'delivery', v_b.delivery, 'total', v_b.total, 'deposit', v_b.deposit, 'paid', v_b.paid,
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
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Выдача по договору' || case when v_row.verified_override then ' (без проверенного профиля — подтвердил сотрудник)' else '' end, v_b.code);
  insert into public.notifications (kind, title, body, ref) values ('booking', 'Выдана ' || v_b.code, v_c.name || ' подписал договор', v_b.id);
  return v_row;
exception
  when exclusion_violation then raise exception 'Эта единица техники уже занята на эти даты';
end $$;
revoke all on function public.issue_booking from public, anon;
grant execute on function public.issue_booking to authenticated;

-- приёмка: чек-лист состояния, бронь закрывается
create or replace function public.return_booking(p_booking_id text, p_check jsonb default '{}', p_note text default null) returns public.bookings
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff := private.current_staff(); v_b public.bookings;
begin
  if v_staff.id is null or not private.has_permission('issue') then raise exception 'Нет прав на приёмку техники'; end if;
  update public.bookings set status = 'returned', returned_at = now(), return_check = coalesce(p_check, '{}'),
         history = history || jsonb_build_object('at', now(), 'by', split_part(v_staff.name, ' ', 1), 'text', 'Возвращена' || coalesce(': ' || nullif(trim(p_note), ''), ''))
   where id = p_booking_id and status = 'issued' returning * into v_b;
  if v_b.id is null then raise exception 'Бронь не на руках у клиента'; end if;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Приёмка техники', v_b.code);
  return v_b;
end $$;
revoke all on function public.return_booking from public, anon;
grant execute on function public.return_booking to authenticated;

-- аннулирование договора (ошибка при выдаче) — только владелец, с причиной; запись остаётся
create or replace function public.void_contract(p_contract_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff := private.current_staff(); v_code text;
begin
  if not private.has_permission('contracts.void') then raise exception 'Нет прав на аннулирование договора'; end if;
  if length(coalesce(trim(p_reason), '')) < 3 then raise exception 'Укажите причину'; end if;
  perform set_config('px.contract_void', '1', true);
  update public.booking_contracts set status = 'void', voided_at = now(), voided_by = v_staff.id, void_reason = trim(p_reason)
   where id = p_contract_id and status = 'signed' returning code into v_code;
  perform set_config('px.contract_void', '', true);
  if v_code is null then raise exception 'Договор не найден или уже аннулирован'; end if;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Договор аннулирован: ' || trim(p_reason), v_code);
end $$;
revoke all on function public.void_contract from public, anon;
grant execute on function public.void_contract to authenticated;

revoke execute on function private.guard_contract() from public, anon, authenticated;
revoke execute on function private.require_contract() from public, anon, authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.booking_contracts; exception when duplicate_object then null; end;
end $$;
