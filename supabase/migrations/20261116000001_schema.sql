-- Pixel Rental — схема базы (Supabase / Postgres 15+)
-- Гость читает каталог и доступность, клиент видит только своё, сотрудники — по правам роли (has_permission).
-- Двойная бронь одной единицы невозможна: исключающее ограничение по периоду на booking_units.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ---------- справочники ----------
create table public.roles (
  id text primary key,
  name text not null,
  color text not null default '#F5923A',
  permissions text[] not null default '{}',
  system boolean not null default false
);

create table public.staff (
  id text primary key default gen_random_uuid()::text,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  phone text,
  role_id text not null references public.roles(id),
  city text not null default 'all' check (city in ('all', 'almaty', 'astana')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  name text not null,
  short text not null,
  sort int not null default 0
);

create table public.products (
  id text primary key,
  name text not null,
  kind text not null,
  brand text not null,
  category_id text not null references public.categories(id),
  price int not null check (price >= 0),          -- ₸ за сутки
  deposit int not null default 0 check (deposit >= 0),
  is_new boolean not null default false,
  hidden boolean not null default false,
  specs text[] not null default '{}',
  includes text[] not null default '{}',
  photo_thumb text,                                -- путь в bucket product-photos или URL
  photo_full text,
  gallery text[] not null default '{}',
  description text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id) where not hidden;

create table public.product_units (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  serial text not null,
  city text not null check (city in ('almaty', 'astana')),
  condition text not null default 'good' check (condition in ('new', 'good', 'worn', 'repair')),
  maintenance boolean not null default false,
  note text
);
create index product_units_product_idx on public.product_units (product_id, city);

create table public.settings (
  id int primary key default 1 check (id = 1),
  tiers jsonb not null default '[{"days":3,"percent":10},{"days":7,"percent":20},{"days":14,"percent":30}]',
  delivery_fee jsonb not null default '{"almaty":3000,"astana":3000}',
  deposit_for_new boolean not null default true,
  night_fee int not null default 0,
  min_hours int not null default 24,
  points jsonb not null default '{}'
);

create table public.promos (
  code text primary key,
  percent int not null check (percent between 1 and 90),
  active boolean not null default true,
  uses int not null default 0,
  note text
);

create table public.banners (
  id bigint generated always as identity primary key,
  image_path text not null,                        -- bucket product-photos/banners/...
  title text not null,
  alt text,
  link text,
  sort int not null default 0,
  active boolean not null default true,
  ends_at timestamptz                              -- просроченные акции скрываются сами
);

-- ---------- клиенты и верификация ----------
create table public.customers (
  id text primary key default gen_random_uuid()::text,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  phone text not null unique,
  email text,
  company text,
  iin text check (iin is null or iin ~ '^\d{12}$'),
  verification text not null default 'none' check (verification in ('none', 'pending', 'verified', 'rejected')),
  reject_reason text,
  consent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text references public.staff(id),
  blacklisted boolean not null default false,
  note text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index customers_verification_idx on public.customers (verification) where verification = 'pending';

-- сканы удостоверения: только путь к файлу в приватном bucket id-scans, не сами картинки
create table public.id_scans (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references public.customers(id) on delete cascade,
  side text not null check (side in ('front', 'back')),
  path text not null,
  created_at timestamptz not null default now(),
  unique (customer_id, side)
);

-- ---------- брони ----------
create table public.bookings (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  customer_id text not null references public.customers(id),
  city text not null check (city in ('almaty', 'astana')),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  days int not null check (days > 0),
  subtotal int not null default 0,
  discount int not null default 0,
  promo text,
  delivery int not null default 0,
  total int not null default 0,
  deposit int not null default 0,
  paid int not null default 0,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid')),
  payment_method text not null default 'kaspi' check (payment_method in ('kaspi', 'card', 'cash', 'invoice')),
  delivery_type text not null default 'pickup' check (delivery_type in ('pickup', 'delivery')),
  address text,
  comment text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'issued', 'returned', 'cancelled')),
  source text not null default 'app',
  manager_id text references public.staff(id),
  awaiting_verification boolean not null default false,
  history jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index bookings_start_idx on public.bookings (start_at);
create index bookings_status_idx on public.bookings (status, start_at);
create index bookings_customer_idx on public.bookings (customer_id, created_at desc);
create index bookings_created_idx on public.bookings (created_at desc);

create table public.booking_items (
  id bigint generated always as identity primary key,
  booking_id text not null references public.bookings(id) on delete cascade,
  product_id text not null references public.products(id),
  qty int not null check (qty > 0),
  price int not null
);
create index booking_items_booking_idx on public.booking_items (booking_id);

-- конкретные единицы техники на период; «active» и период копируются из брони триггером
create table public.booking_units (
  booking_id text not null references public.bookings(id) on delete cascade,
  unit_id text not null references public.product_units(id),
  during tstzrange not null,
  active boolean not null default true,
  primary key (booking_id, unit_id),
  -- защита от двойной брони: одна единица не может быть в двух активных бронях на пересекающиеся даты
  constraint booking_units_no_overlap exclude using gist (unit_id with =, during with &&) where (active)
);
create index booking_units_during_idx on public.booking_units using gist (during);

create or replace function public.sync_booking_units() returns trigger language plpgsql set search_path = public as $$
begin
  update public.booking_units
     set during = tstzrange(new.start_at, greatest(new.end_at, case when new.status = 'issued' then now() else new.end_at end), '[)'),
         active = new.status in ('new', 'confirmed', 'issued')
   where booking_id = new.id;
  return new;
end $$;
create trigger bookings_sync_units after update of start_at, end_at, status on public.bookings
  for each row execute function public.sync_booking_units();

-- ---------- заявки, журнал, уведомления ----------
create table public.leads (
  id text primary key default gen_random_uuid()::text,
  type text not null check (type in ('selection', 'waitlist', 'callback', 'question', 'production')),
  name text not null,
  phone text not null,
  text text not null default '',
  product_id text references public.products(id),
  city text not null default 'almaty' check (city in ('almaty', 'astana')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'lost')),
  assignee_id text references public.staff(id),
  dates tstzrange,
  created_at timestamptz not null default now()
);
create index leads_status_idx on public.leads (status, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id text references public.staff(id),
  action text not null,
  target text
);
create index audit_log_at_idx on public.audit_log (at desc);

create table public.notifications (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lead', 'verification', 'overdue', 'booking', 'system')),
  title text not null,
  body text,
  ref text,
  staff_id text references public.staff(id),     -- null = всем сотрудникам
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_created_idx on public.notifications (created_at desc);

-- ---------- права ----------
create or replace function public.current_staff() returns public.staff
language sql stable security definer set search_path = public as $$
  select * from public.staff where user_id = auth.uid() and active limit 1
$$;

create or replace function public.has_permission(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s join public.roles r on r.id = s.role_id
     where s.user_id = auth.uid() and s.active and p = any (r.permissions)
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active)
$$;

create or replace function public.my_customer_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.customers where user_id = auth.uid() limit 1
$$;

-- клиент не может сам себе поставить «подтверждён»: только none/rejected → pending;
-- служебные поля (чёрный список, заметки, теги) меняют только сотрудники, статус проверки — только с правом verify
create or replace function public.guard_customer_update() returns trigger language plpgsql set search_path = public as $$
begin
  if new.verification is distinct from old.verification and not public.has_permission('verify')
     and not (new.verification = 'pending' and old.verification in ('none', 'rejected')) then
    raise exception 'verification can only be changed by staff';
  end if;
  if not public.is_staff() then
    new.blacklisted := old.blacklisted; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by; new.note := old.note; new.tags := old.tags;
  end if;
  return new;
end $$;
create trigger customers_guard before update on public.customers for each row execute function public.guard_customer_update();
