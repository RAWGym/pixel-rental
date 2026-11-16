-- Pixel Shop: продажа техники (отдельно от аренды). Товары, заказы, промокоды, настройки магазина.
-- Заказ создаётся атомарно функцией create_shop_order: проверка и резерв остатка, промокод, доставка; отмена возвращает остаток.
-- Трейд-ин без загрузки файлов: фото клиент присылает в чате WhatsApp (без открытого хранилища для гостей).

-- права: shop — управлять магазином; shop.view — видеть остатки и заказы
update public.roles set permissions = array(select distinct unnest(permissions || array['shop', 'shop.view'])) where id in ('owner', 'manager');
update public.roles set permissions = array(select distinct unnest(permissions || array['shop.view'])) where id in ('warehouse', 'accountant');

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('lead', 'verification', 'overdue', 'booking', 'system', 'shop'));

create table public.shop_categories (id text primary key, name text not null, sort int not null default 0);
insert into public.shop_categories (id, name, sort) values ('cameras', 'Камеры', 0), ('lenses', 'Объективы', 1) on conflict do nothing;

create table public.shop_products (
  id text primary key,
  sku text,
  brand text not null,
  title text not null,
  category_id text not null references public.shop_categories(id),
  description text,
  specs text[] not null default '{}',
  includes text[] not null default '{}',
  condition text not null default 'new' check (condition in ('new', 'used')),
  price int not null check (price >= 0),
  old_price int check (old_price is null or old_price >= 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort int not null default 0,
  images text[] not null default '{}',     -- asset:<id> (встроенные фото) или URL из bucket shop-photos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shop_settings (
  id int primary key default 1 check (id = 1),
  wa_phone text not null default '77075077971' check (wa_phone ~ '^7\d{10}$'),
  hours text not null default 'Круглосуточно',
  delivery_city_fee int not null default 3000,
  delivery_kz_fee int,                    -- null = стоимость уточнит менеджер
  payments text[] not null default array['Kaspi перевод', 'Kaspi рассрочка', 'Наличные', 'Карта при получении'],
  note text
);
insert into public.shop_settings (id) values (1) on conflict do nothing;

create table public.shop_promos (
  code text primary key,
  percent int check (percent between 1 and 90),
  amount int check (amount > 0),
  active boolean not null default true,
  valid_until timestamptz,
  max_uses int,
  uses int not null default 0,
  check (percent is not null or amount is not null)
);

create sequence if not exists public.shop_order_seq start 1;
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id text references public.customers(id),
  name text not null,
  phone text not null,
  email text,
  delivery_type text not null check (delivery_type in ('pickup', 'city', 'kz')),
  address text,
  payment text not null,
  promo text,
  subtotal int not null,
  discount int not null default 0,
  delivery_fee int,
  total int not null,
  tradein jsonb,
  comment text,
  status text not null default 'whatsapp' check (status in ('whatsapp', 'confirmed', 'paid', 'packed', 'done', 'cancelled')),
  history jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index shop_orders_created_idx on public.shop_orders (created_at desc);
create index shop_orders_phone_idx on public.shop_orders (phone, created_at desc);
create table public.shop_order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_id text not null references public.shop_products(id),
  title text not null,
  price int not null,
  qty int not null check (qty > 0)
);
create index shop_order_items_order_idx on public.shop_order_items (order_id);

alter table public.shop_categories enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_settings enable row level security;
alter table public.shop_promos enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;

create policy shop_cat_read on public.shop_categories for select using (true);
create policy shop_cat_write on public.shop_categories for all using (private.has_permission('shop')) with check (private.has_permission('shop'));
create policy shop_prod_read on public.shop_products for select using (is_active or private.has_permission('shop') or private.has_permission('shop.view'));
create policy shop_prod_write on public.shop_products for all using (private.has_permission('shop')) with check (private.has_permission('shop'));
create policy shop_settings_read on public.shop_settings for select using (true);
create policy shop_settings_write on public.shop_settings for update using (private.has_permission('shop'));
create policy shop_promos_staff on public.shop_promos for all using (private.has_permission('shop')) with check (private.has_permission('shop'));
-- заказы: сотрудники магазина и бухгалтер; клиент видит свои
create policy shop_orders_read on public.shop_orders for select using (private.has_permission('shop') or private.has_permission('shop.view') or (customer_id is not null and customer_id = private.my_customer_id()));
create policy shop_orders_staff on public.shop_orders for update using (private.has_permission('shop'));
create policy shop_items_read on public.shop_order_items for select using (exists (select 1 from public.shop_orders o where o.id = order_id));

-- фото товаров магазина: публичный bucket, загружают сотрудники магазина
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-photos', 'shop-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']) on conflict (id) do nothing;
create policy shop_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'shop-photos' and private.has_permission('shop'));
create policy shop_photos_update on storage.objects for update to authenticated using (bucket_id = 'shop-photos' and private.has_permission('shop'));
create policy shop_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'shop-photos' and private.has_permission('shop'));

-- проверка промокода (для корзины, без расхода)
create or replace function public.check_shop_promo(p_code text, p_subtotal int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v public.shop_promos;
begin
  select * into v from public.shop_promos where upper(code) = upper(trim(p_code));
  if v.code is null or not v.active then return jsonb_build_object('ok', false, 'error', 'Промокод не найден'); end if;
  if v.valid_until is not null and v.valid_until < now() then return jsonb_build_object('ok', false, 'error', 'Срок промокода истёк'); end if;
  if v.max_uses is not null and v.uses >= v.max_uses then return jsonb_build_object('ok', false, 'error', 'Промокод уже использован'); end if;
  return jsonb_build_object('ok', true, 'code', v.code, 'percent', v.percent, 'amount', v.amount,
    'discount', least(p_subtotal, coalesce(round(p_subtotal * v.percent / 100.0)::int, 0) + coalesce(v.amount, 0)));
end $$;

-- оформление заказа: гость или клиент; остаток резервируется сразу
create or replace function public.create_shop_order(
  p_items jsonb, p_name text, p_phone text, p_delivery_type text, p_payment text,
  p_address text default null, p_promo text default null, p_comment text default null, p_tradein jsonb default null, p_email text default null
) returns public.shop_orders
language plpgsql security definer set search_path = public as $$
declare
  v_set public.shop_settings; v_item jsonb; v_prod public.shop_products; v_qty int;
  v_sub int := 0; v_disc int := 0; v_fee int; v_order public.shop_orders; v_promo jsonb; v_phone text;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^\d+]', '', 'g');
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Укажите имя'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 10 then raise exception 'Укажите телефон'; end if;
  if p_delivery_type not in ('pickup', 'city', 'kz') then raise exception 'Выберите способ получения'; end if;
  if p_delivery_type <> 'pickup' and length(trim(coalesce(p_address, ''))) < 5 then raise exception 'Укажите адрес доставки'; end if;
  if jsonb_array_length(coalesce(p_items, '[]')) = 0 or jsonb_array_length(p_items) > 30 then raise exception 'Корзина пуста'; end if;
  -- защита от повторных отправок: не больше 5 заказов с одного номера за 10 минут
  if (select count(*) from public.shop_orders where phone = v_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Слишком много заказов подряд. Напишите нам в WhatsApp.';
  end if;
  select * into v_set from public.shop_settings where id = 1;
  if not (p_payment = any (v_set.payments)) then raise exception 'Выберите способ оплаты'; end if;

  insert into public.shop_orders (code, customer_id, name, phone, email, delivery_type, address, payment, subtotal, total, tradein, comment, history)
  values ('SP-' || (1000 + nextval('public.shop_order_seq')), private.my_customer_id(), trim(p_name), v_phone, nullif(trim(coalesce(p_email, '')), ''),
          p_delivery_type, nullif(trim(coalesce(p_address, '')), ''), p_payment, 0, 0, p_tradein, nullif(left(trim(coalesce(p_comment, '')), 1000), ''),
          jsonb_build_array(jsonb_build_object('at', now(), 'by', 'Клиент', 'text', 'Заказ создан, ожидает связи в WhatsApp')))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(20, coalesce((v_item->>'qty')::int, 1)));
    select * into v_prod from public.shop_products where id = v_item->>'product_id' and is_active for update;
    if v_prod.id is null then raise exception 'Товар больше не продаётся'; end if;
    if v_prod.stock < v_qty then raise exception '%: в наличии %', v_prod.brand || ' ' || v_prod.title, v_prod.stock; end if;
    update public.shop_products set stock = stock - v_qty, updated_at = now() where id = v_prod.id;
    insert into public.shop_order_items (order_id, product_id, title, price, qty) values (v_order.id, v_prod.id, v_prod.brand || ' ' || v_prod.title, v_prod.price, v_qty);
    v_sub := v_sub + v_prod.price * v_qty;
  end loop;

  if nullif(trim(coalesce(p_promo, '')), '') is not null then
    v_promo := public.check_shop_promo(p_promo, v_sub);
    if not (v_promo->>'ok')::boolean then raise exception '%', v_promo->>'error'; end if;
    v_disc := (v_promo->>'discount')::int;
    update public.shop_promos set uses = uses + 1 where code = v_promo->>'code';
  end if;
  v_fee := case p_delivery_type when 'pickup' then 0 when 'city' then v_set.delivery_city_fee else v_set.delivery_kz_fee end;

  update public.shop_orders set subtotal = v_sub, discount = v_disc, promo = v_promo->>'code', delivery_fee = v_fee, total = v_sub - v_disc + coalesce(v_fee, 0)
   where id = v_order.id returning * into v_order;
  insert into public.notifications (kind, title, body, ref) values ('shop', 'Заказ ' || v_order.code, trim(p_name) || ' · ' || v_order.total || ' ₸', v_order.id::text);
  return v_order;
end $$;

-- статус заказа (сотрудник магазина); отмена возвращает остаток
create or replace function public.set_shop_order_status(p_id uuid, p_status text, p_note text default null) returns public.shop_orders
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff := private.current_staff(); v public.shop_orders; v_label text;
begin
  if not private.has_permission('shop') then raise exception 'Нет прав на заказы магазина'; end if;
  select * into v from public.shop_orders where id = p_id for update;
  if v.id is null then raise exception 'Заказ не найден'; end if;
  if v.status = 'cancelled' then raise exception 'Заказ уже отменён'; end if;
  if p_status = 'cancelled' then
    update public.shop_products p set stock = p.stock + i.qty, updated_at = now() from public.shop_order_items i where i.order_id = v.id and p.id = i.product_id;
  end if;
  v_label := case p_status when 'confirmed' then 'Подтверждён' when 'paid' then 'Оплачен' when 'packed' then 'Собран' when 'done' then 'Выдан' when 'cancelled' then 'Отменён, остаток возвращён' else 'Ожидает связи в WhatsApp' end;
  update public.shop_orders set status = p_status,
         history = history || jsonb_build_object('at', now(), 'by', split_part(v_staff.name, ' ', 1), 'text', v_label || coalesce(': ' || nullif(trim(p_note), ''), ''))
   where id = p_id returning * into v;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, 'Заказ магазина: ' || v_label, v.code);
  return v;
end $$;

revoke all on function public.create_shop_order from public;
grant execute on function public.create_shop_order to anon, authenticated;
revoke all on function public.check_shop_promo from public;
grant execute on function public.check_shop_promo to anon, authenticated;
revoke all on function public.set_shop_order_status from public, anon;
grant execute on function public.set_shop_order_status to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.shop_orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.shop_products; exception when duplicate_object then null; end;
end $$;

-- каталог с pixel-shopkz.vercel.app (фото встроены в сайт: asset:<id>)
insert into public.shop_products (id, brand, title, category_id, specs, price, stock, sort, images) values
 ('zve10', 'Sony', 'ZV-E10', 'cameras', array['4K', 'APS-C'], 239990, 1, 1, array['asset:zve10']),
 ('r7', 'Canon', 'EOS R7', 'cameras', array['32.5 МП', 'APS-C'], 519000, 1, 2, array['asset:r7']),
 ('6d2', 'Canon', 'EOS 6D Mark II', 'cameras', array['26.2 МП', 'Full frame'], 300000, 1, 3, array['asset:6d2']),
 ('xe5', 'Fujifilm', 'X-E5 kit', 'cameras', array['40 МП', 'APS-C', 'Kit'], 600000, 1, 4, array['asset:xe5']),
 ('s1424', 'Sigma', '14-24mm f/2.8', 'lenses', array['14-24 мм', 'f/2.8'], 550000, 1, 5, array['asset:s1424']),
 ('s1628', 'Sigma', '16-28mm f/2.8', 'lenses', array['16-28 мм', 'f/2.8'], 300000, 1, 6, array['asset:s1628']),
 ('s2470ii', 'Sigma', '24-70mm f/2.8 II', 'lenses', array['24-70 мм', 'f/2.8', 'II'], 420000, 2, 7, array['asset:s2470ii']),
 ('s2470', 'Sigma', '24-70mm f/2.8', 'lenses', array['24-70 мм', 'f/2.8'], 356000, 2, 8, array['asset:s2470']),
 ('s2870', 'Sigma', '28-70mm f/2.8', 'lenses', array['28-70 мм', 'f/2.8'], 299990, 1, 9, array['asset:s2870']),
 ('s35', 'Sigma', '35mm', 'lenses', array['35 мм', 'Canon EF'], 280000, 1, 10, array['asset:s35']),
 ('g14', 'Sony', 'FE 14mm f/1.8 GM', 'lenses', array['14 мм', 'f/1.8', 'G Master'], 400000, 1, 11, array['asset:g14']),
 ('g2470', 'Sony', 'FE 24-70mm f/2.8 GM', 'lenses', array['24-70 мм', 'f/2.8', 'G Master'], 600000, 1, 12, array['asset:g2470']),
 ('g50', 'Sony', 'FE 50mm f/1.4 GM', 'lenses', array['50 мм', 'f/1.4', 'G Master'], 525000, 1, 13, array['asset:g50'])
on conflict (id) do nothing;
