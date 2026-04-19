-- PsicoApp
-- Template de RLS para publicacao rapida com um unico operador.
--
-- Use somente se houver exatamente uma conta real usando o sistema.
-- Se existir mais de um usuario autenticado, todos terao acesso total aos dados.

begin;

alter table if exists public.pacientes enable row level security;
alter table if exists public.entradas enable row level security;
alter table if exists public.agendamentos enable row level security;

drop policy if exists "psicoapp_authenticated_select_pacientes" on public.pacientes;
create policy "psicoapp_authenticated_select_pacientes"
on public.pacientes
for select
to authenticated
using (true);

drop policy if exists "psicoapp_authenticated_insert_pacientes" on public.pacientes;
create policy "psicoapp_authenticated_insert_pacientes"
on public.pacientes
for insert
to authenticated
with check (true);

drop policy if exists "psicoapp_authenticated_update_pacientes" on public.pacientes;
create policy "psicoapp_authenticated_update_pacientes"
on public.pacientes
for update
to authenticated
using (true)
with check (true);

drop policy if exists "psicoapp_authenticated_delete_pacientes" on public.pacientes;
create policy "psicoapp_authenticated_delete_pacientes"
on public.pacientes
for delete
to authenticated
using (true);

drop policy if exists "psicoapp_authenticated_select_entradas" on public.entradas;
create policy "psicoapp_authenticated_select_entradas"
on public.entradas
for select
to authenticated
using (true);

drop policy if exists "psicoapp_authenticated_insert_entradas" on public.entradas;
create policy "psicoapp_authenticated_insert_entradas"
on public.entradas
for insert
to authenticated
with check (true);

drop policy if exists "psicoapp_authenticated_update_entradas" on public.entradas;
create policy "psicoapp_authenticated_update_entradas"
on public.entradas
for update
to authenticated
using (true)
with check (true);

drop policy if exists "psicoapp_authenticated_delete_entradas" on public.entradas;
create policy "psicoapp_authenticated_delete_entradas"
on public.entradas
for delete
to authenticated
using (true);

drop policy if exists "psicoapp_authenticated_select_agendamentos" on public.agendamentos;
create policy "psicoapp_authenticated_select_agendamentos"
on public.agendamentos
for select
to authenticated
using (true);

drop policy if exists "psicoapp_authenticated_insert_agendamentos" on public.agendamentos;
create policy "psicoapp_authenticated_insert_agendamentos"
on public.agendamentos
for insert
to authenticated
with check (true);

drop policy if exists "psicoapp_authenticated_update_agendamentos" on public.agendamentos;
create policy "psicoapp_authenticated_update_agendamentos"
on public.agendamentos
for update
to authenticated
using (true)
with check (true);

drop policy if exists "psicoapp_authenticated_delete_agendamentos" on public.agendamentos;
create policy "psicoapp_authenticated_delete_agendamentos"
on public.agendamentos
for delete
to authenticated
using (true);

commit;
