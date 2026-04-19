# Supabase Go-Live

Checklist objetivo para publicar o `psicoapp` na Vercel com o banco protegido.

## O que o app web faz hoje

- O frontend usa o cliente browser do Supabase em `src/lib/supabase.ts`.
- As leituras e escritas acontecem direto do navegador nas tabelas `public.pacientes`, `public.entradas` e `public.agendamentos`.
- O frontend atual nao usa `public.pacientes_consolidados`.

Isso significa que a seguranca do app publicado depende diretamente de:

- Auth do Supabase
- RLS nas tabelas expostas pelo Data API
- configuracao de usuarios e signups no painel do Supabase

## Recomendacao pratica para o go-live

### Cenario A: um unico operador

Use este cenario se so existe uma conta real de uso da aplicacao.

Passos:

1. Desative novos cadastros no Supabase Auth.
2. Desative sign-ins anonimos.
3. Habilite RLS em `pacientes`, `entradas` e `agendamentos`.
4. Aplique politicas `to authenticated` para `select`, `insert`, `update` e `delete`.
5. Garanta que so a sua conta esteja ativa em `Authentication > Users`.

Este e o caminho mais rapido para publicar sem mexer no schema atual.

Limite importante:

- Se voce criar uma segunda conta autenticada, ela vera e podera alterar todos os registros.

### Cenario B: mais de um operador, agora ou em breve

Nao publique com politica `authenticated = acesso total`.

Neste caso, o schema precisa de isolamento por proprietario, por exemplo com uma coluna `owner_id uuid references auth.users(id)` nas tabelas principais.

Passos recomendados:

1. Adicionar `owner_id` em `pacientes`, `entradas` e `agendamentos`.
2. Preencher `owner_id` nos dados existentes.
3. Indexar `owner_id`.
4. Criar politicas com `auth.uid() = owner_id`.
5. So depois habilitar o uso por mais de uma conta.

## Checklist de painel no Supabase

### Authentication

- `Allow new users to sign up`: desligado para o cenario A
- `Allow anonymous sign-ins`: desligado
- `Confirm Email`: ligado se voce quiser mais rigor operacional
- Revisar `Users` e remover qualquer conta que nao deva acessar o sistema

### Database

- Habilitar RLS nas tabelas:
  - `public.pacientes`
  - `public.entradas`
  - `public.agendamentos`
- Se `public.pacientes_consolidados` continuar sem uso no app, nao criar policy permissiva para ela
- Rodar o Security Advisor do Supabase e zerar alertas relevantes antes do go-live

### API

- Manter o schema exposto restrito ao necessario
- Evitar colocar dados internos novos no schema `public` sem RLS

## SQL pronto para o cenario A

Use o arquivo:

- `supabase/templates/rls-single-operator.sql`

Ele foi preparado para o modelo atual do frontend.

## Teste minimo depois do RLS

Com a sua conta autenticada:

1. Entrar no app
2. Listar pacientes
3. Criar paciente
4. Editar paciente
5. Criar agendamento
6. Editar agendamento pelo calendario
7. Salvar atendimento

Sem autenticacao:

1. Abrir o app
2. Confirmar que nao ha acesso a dados

## Pendencia estrutural que ainda existe

Hoje o app nao implementa isolamento por usuario no schema. Isso nao bloqueia o go-live de operador unico, mas bloqueia um go-live multiusuario seguro sem nova migracao de banco.
