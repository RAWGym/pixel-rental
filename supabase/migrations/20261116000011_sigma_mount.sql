-- Байонет Sony E для Sigma без указанной системы (подтвердил владелец). Fisheye 8-15 уже Canon EF.
update public.products set specs = specs || array['Байонет: Sony E'], updated_at = now()
 where id in ('lenses-sigma-art-24-70-mm-f2-8-dg-dn-ii', 'lenses-sigma-art-14-24mm-f2-8', 'lenses-sigma-10-18mm-f2-8-dc-dn')
   and not exists (select 1 from unnest(specs) s where s ilike 'Байонет%');
