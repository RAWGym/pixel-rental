-- Базовые роли, категории и настройки. Каталог (241 позиция, 351 единица) — supabase/seed/catalog-1..4.sql (генерирует scripts/gen-seed-sql.mjs).

insert into public.roles (id, name, color, permissions, system) values
  ('owner', 'Владелец', '#FF962E', array['dashboard','bookings.view','bookings.edit','bookings.cancel','calendar','products.view','products.edit','pricing.edit','units.edit','leads','customers','customers.blacklist','verify','staff','settings','finance'], true),
  ('manager', 'Менеджер', '#5AB0FF', array['dashboard','bookings.view','bookings.edit','bookings.cancel','calendar','products.view','leads','customers','verify'], false),
  ('warehouse', 'Кладовщик', '#7EE08A', array['dashboard','bookings.view','calendar','products.view','units.edit'], false),
  ('accountant', 'Бухгалтер', '#C9A7FF', array['dashboard','bookings.view','finance','customers'], false)
on conflict (id) do update set name = excluded.name, permissions = excluded.permissions;

insert into public.categories (id, name, short, sort) values
  ('kits', 'Готовые комплекты', 'Наборы', 0), ('cameras', 'Камеры', 'Камеры', 1), ('lenses', 'Объективы', 'Оптика', 2),
  ('light', 'Свет', 'Свет', 3), ('sound', 'Звук', 'Звук', 4), ('gimbals', 'Стабилизаторы', 'Стабы', 5),
  ('batteries', 'Аккумуляторы и питание', 'АКБ', 6), ('drones', 'Дроны', 'Дроны', 7), ('memory', 'Карты памяти', 'Карты', 8),
  ('grip', 'Grip и крепления', 'Grip', 9), ('monitors', 'Мониторы', 'Мониторы', 10), ('softboxes', 'Софтбоксы', 'Софтбоксы', 11),
  ('filters', 'Фильтры', 'Фильтры', 12), ('stands', 'Стойки и штативы', 'Стойки', 13), ('cables', 'Кабели', 'Шнуры', 14), ('misc', 'Разное', 'Разное', 15)
on conflict (id) do nothing;

insert into public.settings (id, points) values (1, '{
  "almaty": {"address": "ул. Толе би, 176", "hours": "Круглосуточно", "open": 0, "close": 24, "phone": ""},
  "astana": {"address": "ул. Бокейхана, 6", "hours": "09:00–21:00, без выходных", "open": 9, "close": 21, "phone": ""}
}') on conflict (id) do nothing;

-- Первый владелец: после регистрации в Supabase Auth выполните (подставив его user id):
--   insert into public.staff (name, phone, role_id, user_id) values ('Имя Фамилия', '+7 …', 'owner', '<auth.users.id>');
