# PsicoApp

Aplicativo web de gestao clinica em `Next.js + Supabase`, preparado para deploy estatico.

## Estado atual

- A raiz do repositorio agora e `Cloudflare-ready`
- O frontend ativo fica em `app/` e `src/`
- O legado em Streamlit foi arquivado em `legacy/streamlit/`

## Requisitos

- Node.js 20+
- Variaveis de ambiente do Supabase

## Ambiente local

1. Crie um arquivo `.env.local` com base em `.env.example`.
2. Instale as dependencias:

```bash
npm install
```

3. Rode o app web:

```bash
npm run dev
```

4. Valide o build de producao:

```bash
npm run typecheck
npm run build
```

## Deploy no Cloudflare Pages

1. Importe este repositorio no Cloudflare Pages.
2. Use o preset `Next.js (Static HTML Export)`.
3. Configure as variaveis:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Use:
   - Build command: `npm run build`
   - Build output directory: `out`
5. Rode um deploy de preview e valide:
   - login
   - pacientes
   - sessoes
   - calendario

## Guia do Cloudflare

- Passo a passo: `docs/cloudflare-pages.md`

## Checklist de corte final do Streamlit

- Desligar qualquer processo local de `streamlit run`
- Parar de usar `legacy/streamlit` como runtime
- Garantir RLS e policies no Supabase para as tabelas consumidas pelo frontend
- Rotacionar credenciais antigas se algum segredo do Streamlit ja tiver sido versionado no passado

## Go-live do Supabase

- Checklist: `docs/supabase-go-live.md`
- SQL de operador unico: `supabase/templates/rls-single-operator.sql`

## Fluxos web ativos

- Login com email e senha via Supabase Auth
- Painel consolidado de pacientes
- Cadastro e edicao de pacientes
- Lancamento e agendamento de sessoes
- Calendario semanal e mensal
