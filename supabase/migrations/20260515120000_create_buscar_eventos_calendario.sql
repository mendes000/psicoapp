create or replace function public.buscar_eventos_calendario(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Acesso negado';
  end if;

  return jsonb_build_object(
    'entradas',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'data', e.data,
            'nome', e.nome,
            'tipo', e.tipo,
            'valor_sessao', e.valor_sessao,
            'valor_pago', e.valor_pago
          )
          order by e.data asc
        )
        from public.entradas e
        where e.data between p_start and p_end
      ),
      '[]'::jsonb
    ),
    'agendamentos',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'data', a.data,
            'nome', a.nome,
            'tipo', a.tipo,
            'valor_sessao', a.valor_sessao,
            'valor_pago', a.valor_pago,
            'obs', a.obs
          )
          order by a.data asc
        )
        from public.agendamentos a
        where a.data between p_start and p_end
      ),
      '[]'::jsonb
    )
  );
end;
$$;
