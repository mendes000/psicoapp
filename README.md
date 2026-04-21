# PsicoApp

Aplicativo web de gestao clinica em `Next.js + Supabase`, com deploy estatico no Cloudflare Pages.

## Arquitetura atual

- Frontend ativo em `app/` e `src/`
- Autenticacao e dados servidos pelo Supabase
- Build estatico gerado em `out/`
- Deploy automatico por GitHub Actions para Cloudflare Pages

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

## Fluxos web ativos

- Login com email e senha
- Painel consolidado de pacientes
- Cadastro e edicao de pacientes
- Lancamento e agendamento de sessoes
- Calendario semanal e mensal

## Deploy

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

## Documentacao de apoio

- Passo a passo: `docs/cloudflare-pages.md`
- Checklist: `docs/supabase-go-live.md`
- SQL de operador unico: `supabase/templates/rls-single-operator.sql`
