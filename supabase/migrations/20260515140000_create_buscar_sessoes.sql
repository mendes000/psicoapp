create or replace function public.buscar_sessoes(
  p_search text default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_limit integer := greatest(coalesce(p_limit, 30), 1);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Acesso negado';
  end if;

  return (
    with filtered as (
      select
        e.id,
        e.data,
        e.nome,
        e.tipo,
        e.valor_sessao,
        e.valor_pago,
        e.obs
      from public.entradas e
      where
        (p_from_date is null or e.data >= p_from_date)
        and (p_to_date is null or e.data <= p_to_date)
        and (
          v_search is null
          or e.nome ilike '%' || v_search || '%'
          or e.obs ilike '%' || v_search || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by data desc nulls last, id desc nulls last
      limit v_limit
      offset v_offset
    )
    select jsonb_build_object(
      'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', p.id,
              'data', p.data,
              'nome', p.nome,
              'tipo', p.tipo,
              'valor_sessao', p.valor_sessao,
              'valor_pago', p.valor_pago,
              'obs', p.obs
            )
            order by p.data desc nulls last, p.id desc nulls last
          )
          from paged p
        ),
        '[]'::jsonb
      ),
      'total',
      (select count(*)::integer from filtered)
    )
  );
end;
$$;
