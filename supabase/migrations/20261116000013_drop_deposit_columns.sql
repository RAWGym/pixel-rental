-- Шаг 2: удаление колонок залога. Применено вручную владельцем в SQL Editor 2026-11-16 после выкладки сайта без залога.
alter table public.products drop column if exists deposit;
alter table public.bookings drop column if exists deposit;
alter table public.settings drop column if exists deposit_for_new;
