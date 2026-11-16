-- Шаг 2 (применять ПОСЛЕ выкладки сайта без залога: старый код ещё пишет эти колонки).
alter table public.products drop column if exists deposit;
alter table public.bookings drop column if exists deposit;
alter table public.settings drop column if exists deposit_for_new;
