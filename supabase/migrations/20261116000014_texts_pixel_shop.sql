-- Тексты без длинных тире (диапазоны через дефис).
update public.products set name = replace(replace(name, ' – ', ' - '), '–', '-'), updated_at = now() where name ~ '[—–]';
update public.products set specs = array(select replace(replace(replace(s, ' — ', ': '), ' – ', ' - '), '–', '-') from unnest(specs) s), updated_at = now()
 where array_to_string(specs, '|') ~ '[—–]';
update public.settings set points = replace(points::text, '–', '-')::jsonb where id = 1 and points::text ~ '[—–]';
-- Аренда и магазин в одном месте: Алматы, ул. Толе би, 174 · Pixel Shop, круглосуточно. Меняется в Настройках → Точка: Алматы.
update public.settings set points = jsonb_set(jsonb_set(points, '{almaty,address}', '"ул. Толе би, 174"'), '{almaty,name}', '"Pixel Shop"') where id = 1;
