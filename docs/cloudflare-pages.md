# Cloudflare Pages

Configuracao recomendada para publicar o `psicoapp` no Cloudflare Pages.

## Estrategia adotada

O projeto foi preparado para `static export` do Next.js.

Isso faz sentido aqui porque:

- o app e renderizado no cliente
- a autenticacao e os dados ficam no Supabase
- o projeto atual nao depende de Route Handlers, Server Actions ou runtime Node no servidor

Com isso, o build gera arquivos estaticos em `out/`, que podem ser hospedados no Pages sem camada extra.

## Ajustes feitos no projeto

- `next.config.ts` usa `output: "export"`
- `.nvmrc` fixa `Node 20`
- o build gera a saida estatica padrao em `out/`

## Configuracao no painel do Cloudflare Pages

### Opcao 1: Git integration

Ao conectar o repositorio:

- Framework preset: `Next.js (Static HTML Export)`
- Build command: `npm run build`
- Build output directory: `out`

### Variaveis de ambiente

Defina no projeto:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Observacao importante:

- como o app esta em export estatico, as variaveis `NEXT_PUBLIC_*` entram no bundle no momento do build
- se voce mudar esses valores no Cloudflare, precisa fazer novo deploy para refletir no site

### Versao do Node

O repositorio inclui `.nvmrc` com `20`, que deve ser respeitado no build.

Se quiser forcar pelo painel, use tambem:

- `NODE_VERSION=20`

## Validacao local

Antes do deploy:

```bash
npm run typecheck
npm run build
```

Depois confirme que o build gerou `out/`.

## Quando esta estrategia deixa de servir

Se o projeto passar a usar qualquer item abaixo, reavalie o deploy para o modelo de Next.js em Workers em vez de export estatico:

- Route Handlers
- Server Actions
- acesso a cookies do lado do servidor
- logica dependente de request
- qualquer backend executado pelo Next
