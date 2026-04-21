create extension if not exists pg_trgm;

create or replace function public.buscar_painel_clinico(
  search_text text default null,
  review_only boolean default false,
  item_limit integer default 20
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_search text := lower(trim(coalesce(search_text, '')));
  v_search_digits text := regexp_replace(coalesce(search_text, ''), '\D', '', 'g');
  v_limit integer := greatest(coalesce(item_limit, 20), 1);
begin
  return (
    with patient_base as (
      select
        lower(regexp_replace(trim(coalesce(p.nome, '')), '\s+', ' ', 'g')) as nome_key,
        p.id,
        coalesce(trim(p.nome), '') as nome,
        coalesce(p.nascimento::text, '') as nascimento,
        coalesce(p.cpf, '') as cpf,
        coalesce(p.tratamento, '') as tratamento,
        coalesce(p.profissao, '') as profissao,
        coalesce(p.origem, '') as origem,
        coalesce(p.quem_indicou, '') as quem_indicou,
        coalesce(p.telefone, '') as telefone,
        coalesce(p.email, '') as email,
        coalesce(nullif(trim(coalesce(p.nome_do_contato, '')), ''), coalesce(p.nome_contato, ''), '') as nome_contato,
        coalesce(nullif(trim(coalesce(p.contato_emergencia, '')), ''), coalesce(p.contato_de_emergencia, ''), '') as contato_emergencia,
        coalesce(p.endereco, '') as endereco,
        coalesce(p.bairro, '') as bairro,
        coalesce(p.cidade, '') as cidade,
        coalesce(p.cep, '') as cep,
        coalesce(nullif(trim(coalesce(p.nome_do_pai, '')), ''), coalesce(p.nome_pai, ''), '') as nome_pai,
        coalesce(nullif(trim(coalesce(p.nome_da_mae, '')), ''), coalesce(p.nome_mae, ''), '') as nome_mae,
        coalesce(nullif(trim(coalesce(p.observacoees, '')), ''), coalesce(p.observacoes, ''), '') as observacoes
      from public.pacientes p
      where trim(coalesce(p.nome, '')) <> ''
    ),
    patient_groups as (
      select
        nome_key,
        count(*) as duplicate_name_count
      from patient_base
      group by nome_key
    ),
    entries_ranked as (
      select
        lower(regexp_replace(trim(coalesce(e.nome, '')), '\s+', ' ', 'g')) as nome_key,
        e.id,
        e.data,
        e.nome,
        e.tipo,
        coalesce(e.valor_sessao, 0) as valor_sessao,
        coalesce(e.valor_pago, 0) as valor_pago,
        coalesce(e.obs, '') as obs,
        coalesce(e.anotacoes_clinicas, '') as anotacoes_clinicas,
        row_number() over (
          partition by lower(regexp_replace(trim(coalesce(e.nome, '')), '\s+', ' ', 'g'))
          order by e.data desc nulls last, e.id desc nulls last
        ) as rn
      from public.entradas e
      where trim(coalesce(e.nome, '')) <> ''
    ),
    entry_groups as (
      select
        e.nome_key,
        count(*)::integer as total_sessoes,
        coalesce(sum(e.valor_pago), 0)::numeric(12,2) as total_pago,
        (coalesce(sum(e.valor_pago), 0) - coalesce(sum(e.valor_sessao), 0))::numeric(12,2) as saldo,
        max(e.data) as ultima_sessao_data,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', e.id,
              'data', e.data,
              'nome', e.nome,
              'tipo', e.tipo,
              'valor_sessao', e.valor_sessao,
              'valor_pago', e.valor_pago,
              'obs', e.obs,
              'anotacoes_clinicas', e.anotacoes_clinicas
            )
            order by e.data desc nulls last, e.id desc nulls last
          ) filter (where e.rn <= 5),
          '[]'::jsonb
        ) as ultimas_sessoes
      from entries_ranked e
      group by e.nome_key
    ),
    patient_lines as (
      select
        concat('patient:', coalesce(pb.id::text, pb.nome_key)) as key,
        concat('id:', coalesce(pb.id::text, pb.nome_key)) as "patientKey",
        true as "hasPatientRecord",
        case
          when pg.duplicate_name_count > 1 then 'duplicate-name'
          else 'ok'
        end as "reviewState",
        pg.duplicate_name_count::integer as "duplicateNameCount",
        case
          when pg.duplicate_name_count > 1 then
            'Existe mais de um cadastro com este nome. O painel nao vincula sessoes automaticamente nesses casos.'
          else
            ''
        end as "reviewNote",
        pb.nome,
        pb.nascimento,
        pb.cpf,
        pb.tratamento,
        pb.profissao,
        pb.origem,
        pb.quem_indicou as "quemIndicou",
        pb.telefone,
        pb.email,
        pb.nome_contato as "nomeContato",
        pb.contato_emergencia as "contatoEmergencia",
        pb.endereco,
        pb.bairro,
        pb.cidade,
        pb.cep,
        pb.nome_pai as "nomePai",
        pb.nome_mae as "nomeMae",
        pb.observacoes,
        case when pg.duplicate_name_count = 1 then coalesce(eg.total_sessoes, 0) else 0 end as "totalSessoes",
        case when pg.duplicate_name_count = 1 then coalesce(eg.total_pago, 0) else 0 end as "totalPago",
        case when pg.duplicate_name_count = 1 then coalesce(eg.saldo, 0) else 0 end as saldo,
        case when pg.duplicate_name_count = 1 then coalesce(eg.ultima_sessao_data, '') else '' end as "ultimaSessaoData",
        case when pg.duplicate_name_count = 1 then coalesce(eg.ultimas_sessoes, '[]'::jsonb) else '[]'::jsonb end as "ultimasSessoes"
      from patient_base pb
      join patient_groups pg on pg.nome_key = pb.nome_key
      left join entry_groups eg on eg.nome_key = pb.nome_key
    ),
    ambiguous_entry_lines as (
      select
        concat('entries:', pb.nome_key) as key,
        '' as "patientKey",
        false as "hasPatientRecord",
        'entry-only' as "reviewState",
        pg.duplicate_name_count::integer as "duplicateNameCount",
        'Ha sessoes com este nome, mas existem multiplos cadastros homonimos. Revise manualmente antes de assumir o vinculo.' as "reviewNote",
        concat(max(pb.nome), ' | sessoes sem vinculo seguro') as nome,
        '' as nascimento,
        '' as cpf,
        '' as tratamento,
        '' as profissao,
        '' as origem,
        '' as "quemIndicou",
        '' as telefone,
        '' as email,
        '' as "nomeContato",
        '' as "contatoEmergencia",
        '' as endereco,
        '' as bairro,
        '' as cidade,
        '' as cep,
        '' as "nomePai",
        '' as "nomeMae",
        '' as observacoes,
        coalesce(eg.total_sessoes, 0) as "totalSessoes",
        coalesce(eg.total_pago, 0) as "totalPago",
        coalesce(eg.saldo, 0) as saldo,
        coalesce(eg.ultima_sessao_data, '') as "ultimaSessaoData",
        coalesce(eg.ultimas_sessoes, '[]'::jsonb) as "ultimasSessoes"
      from patient_base pb
      join patient_groups pg on pg.nome_key = pb.nome_key and pg.duplicate_name_count > 1
      join entry_groups eg on eg.nome_key = pb.nome_key
      group by pb.nome_key, pg.duplicate_name_count, eg.total_sessoes, eg.total_pago, eg.saldo, eg.ultima_sessao_data, eg.ultimas_sessoes
    ),
    orphan_entry_lines as (
      select
        concat('entries:', eg.nome_key) as key,
        '' as "patientKey",
        false as "hasPatientRecord",
        'entry-only' as "reviewState",
        0 as "duplicateNameCount",
        'Existem sessoes registradas com este nome, mas nenhum cadastro correspondente foi encontrado.' as "reviewNote",
        coalesce(trim((eg.ultimas_sessoes -> 0 ->> 'nome')), eg.nome_key) as nome,
        '' as nascimento,
        '' as cpf,
        '' as tratamento,
        '' as profissao,
        '' as origem,
        '' as "quemIndicou",
        '' as telefone,
        '' as email,
        '' as "nomeContato",
        '' as "contatoEmergencia",
        '' as endereco,
        '' as bairro,
        '' as cidade,
        '' as cep,
        '' as "nomePai",
        '' as "nomeMae",
        '' as observacoes,
        coalesce(eg.total_sessoes, 0) as "totalSessoes",
        coalesce(eg.total_pago, 0) as "totalPago",
        coalesce(eg.saldo, 0) as saldo,
        coalesce(eg.ultima_sessao_data, '') as "ultimaSessaoData",
        coalesce(eg.ultimas_sessoes, '[]'::jsonb) as "ultimasSessoes"
      from entry_groups eg
      left join patient_groups pg on pg.nome_key = eg.nome_key
      where pg.nome_key is null
    ),
    consolidated_lines as (
      select * from patient_lines
      union all
      select * from ambiguous_entry_lines
      union all
      select * from orphan_entry_lines
    ),
    filtered_lines as (
      select *
      from consolidated_lines cl
      where
        (not review_only or cl."reviewState" <> 'ok')
        and (
          v_search = ''
          or lower(cl.nome) like '%' || v_search || '%'
          or similarity(lower(cl.nome), v_search) >= 0.72
          or lower(cl.cpf) like '%' || v_search || '%'
          or lower(cl.email) like '%' || v_search || '%'
          or (
            v_search_digits <> ''
            and regexp_replace(cl.telefone, '\D', '', 'g') like '%' || v_search_digits || '%'
          )
        )
    ),
    limited_lines as (
      select *
      from filtered_lines
      order by
        "ultimaSessaoData" desc,
        lower(nome) asc
      limit case
        when v_search = '' and not review_only then v_limit
        else 1000
      end
    ),
    metrics as (
      select jsonb_build_object(
        'totalCadastros', (select count(*)::integer from patient_lines where "hasPatientRecord"),
        'totalSessoes', (select count(*)::integer from public.entradas),
        'totalPago', coalesce((select sum(coalesce(valor_pago, 0)) from public.entradas), 0),
        'saldo', coalesce((select sum(coalesce(valor_pago, 0) - coalesce(valor_sessao, 0)) from public.entradas), 0)
      ) as payload
    )
    select jsonb_build_object(
      'metrics', metrics.payload,
      'reviewCount', (select count(*)::integer from consolidated_lines where "reviewState" <> 'ok'),
      'totalCount', (select count(*)::integer from filtered_lines),
      'limited', (v_search = '' and not review_only and (select count(*) from filtered_lines) > (select count(*) from limited_lines)),
      'items', coalesce(
        (
          select jsonb_agg(to_jsonb(limited_lines) order by "ultimaSessaoData" desc, lower(nome) asc)
          from limited_lines
        ),
        '[]'::jsonb
      )
    )
    from metrics
  );
end;
$$;
