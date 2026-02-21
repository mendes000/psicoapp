create table if not exists public.pacientes_consolidados (
  nome_key text primary key,
  nome text not null,
  nascimento text,
  cpf text,
  tratamento text,
  profissao text,
  origem text,
  quem_indicou text,
  telefone text,
  email text,
  nome_contato text,
  contato_emergencia text,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  nome_pai text,
  nome_mae text,
  observacoes text,
  total_sessoes integer not null default 0,
  total_cobrado numeric(12,2) not null default 0,
  total_pago numeric(12,2) not null default 0,
  saldo numeric(12,2) not null default 0,
  ultimas_sessoes jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_pacientes_consolidados_nome on public.pacientes_consolidados (nome);
create index if not exists idx_pacientes_consolidados_cpf on public.pacientes_consolidados (cpf);
create index if not exists idx_pacientes_consolidados_email on public.pacientes_consolidados (email);

create or replace function public.definir_atualizado_em_pacientes_consolidados()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_pacientes_consolidados_atualizado_em on public.pacientes_consolidados;
create trigger trg_pacientes_consolidados_atualizado_em
before update on public.pacientes_consolidados
for each row execute function public.definir_atualizado_em_pacientes_consolidados();
