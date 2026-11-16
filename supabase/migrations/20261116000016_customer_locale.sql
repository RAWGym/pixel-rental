-- Язык интерфейса клиента (RU | KZ): выбор сохраняется в профиле
alter table public.customers add column if not exists locale text check (locale in ('ru', 'kk'));
