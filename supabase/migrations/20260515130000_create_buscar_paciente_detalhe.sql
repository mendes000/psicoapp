create or replace function public.buscar_paciente_detalhe(
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acesso negado';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pacientes'
      and column_name = 'observacoes'
  ) then
    select to_jsonb(p)
    into v_result
    from public.pacientes p
    where p.id = p_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pacientes'
      and column_name = 'observacoees'
  ) then
    select to_jsonb(p)
    into v_result
    from public.pacientes p
    where p.id = p_id;
  else
    select to_jsonb(p)
    into v_result
    from public.pacientes p
    where p.id = p_id;
  end if;

  return v_result;
end;
$$;
