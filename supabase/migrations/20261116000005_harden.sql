-- Усиление по Security Advisor: служебные функции прав — в непубличную схему private
-- (политики RLS ссылаются на них по OID и продолжают работать, а через REST /rpc они недоступны).
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.current_staff() set schema private;
alter function public.has_permission(text) set schema private;
alter function public.is_staff() set schema private;
alter function public.my_customer_id() set schema private;
grant execute on all functions in schema private to anon, authenticated;

-- триггерные функции не вызываются напрямую
revoke execute on function public.notify_lead() from public, anon, authenticated;
revoke execute on function public.notify_scan() from public, anon, authenticated;
revoke execute on function public.sync_booking_units() from public, anon, authenticated;

-- расширение — в отдельную схему
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- функции, которые ссылались на помощников по имени, — на private.*
create or replace function public.cancel_my_booking(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings
     set status = 'cancelled', history = history || jsonb_build_object('at', now(), 'by', 'Клиент', 'text', 'Отменена клиентом')
   where id = p_id and customer_id = private.my_customer_id() and status in ('new', 'confirmed') and start_at > now();
  if not found then raise exception 'Эту бронь уже нельзя отменить'; end if;
end $$;

create or replace function public.review_customer(p_id text, p_ok boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_staff public.staff := private.current_staff();
begin
  if not private.has_permission('verify') then raise exception 'Нет прав на проверку документов'; end if;
  update public.customers set verification = case when p_ok then 'verified' else 'rejected' end,
         reject_reason = case when p_ok then null else p_reason end, reviewed_at = now(), reviewed_by = v_staff.id
   where id = p_id;
  if p_ok then update public.bookings set awaiting_verification = false where customer_id = p_id and awaiting_verification; end if;
  insert into public.audit_log (staff_id, action, target) values (v_staff.id, case when p_ok then 'Профиль подтверждён' else 'Профиль отклонён: ' || coalesce(p_reason, '') end, p_id);
end $$;

create or replace function public.guard_customer_update() returns trigger language plpgsql set search_path = public as $$
begin
  if new.verification is distinct from old.verification and not private.has_permission('verify')
     and not (new.verification = 'pending' and old.verification in ('none', 'rejected')) then
    raise exception 'verification can only be changed by staff';
  end if;
  if not private.is_staff() then
    new.blacklisted := old.blacklisted; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by; new.note := old.note; new.tags := old.tags;
  end if;
  return new;
end $$;
revoke execute on function public.guard_customer_update() from public, anon, authenticated;
revoke all on function public.cancel_my_booking from public, anon;
grant execute on function public.cancel_my_booking to authenticated;
revoke all on function public.review_customer from public, anon;
grant execute on function public.review_customer to authenticated;
