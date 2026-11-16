-- Сотрудник с правом «Клиенты» может завести клиента вручную (звонок, точка)
create policy customers_staff_insert on public.customers for insert with check (private.has_permission('customers'));
