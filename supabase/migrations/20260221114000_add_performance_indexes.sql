create extension if not exists pg_trgm;

create index if not exists idx_pacientes_nome_btree
on public.pacientes (nome);

create index if not exists idx_entradas_nome_data
on public.entradas (nome, data desc);

create index if not exists idx_agendamentos_nome_data
on public.agendamentos (nome, data desc);

create index if not exists idx_pacientes_nome_trgm
on public.pacientes using gin (nome gin_trgm_ops);

create index if not exists idx_entradas_nome_trgm
on public.entradas using gin (nome gin_trgm_ops);

create index if not exists idx_agendamentos_nome_trgm
on public.agendamentos using gin (nome gin_trgm_ops);
