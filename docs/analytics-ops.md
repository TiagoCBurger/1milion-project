# Analytics — Operações

Guia operacional da feature de analytics. Complementa `analytics-plan.md` (design).

## Componentes implantados

| Serviço           | Onde                                       | Responsabilidade                                  |
| ----------------- | ------------------------------------------ | ------------------------------------------------- |
| `track-worker`    | Cloudflare Worker (`track.vibefly.app`)    | Serve `/s.js`, recebe `POST /event`, sinks AE+PG+CAPI |
| Analytics Engine  | Cloudflare (dataset `vibefly_events`)      | Armazena todos os eventos (20 blobs + 10 doubles) |
| Supabase Postgres | Schema `analytics`                         | Sites, custom events com props, user profiles     |
| Next.js API       | `/api/analytics/[siteId]/*`                | Lê AE via SQL API + Postgres                      |
| Dashboard UI      | `/dashboard/[slug]/analytics`              | Overview, conversions, events, settings           |

## Primeira instalação

### 1. Supabase

```bash
pnpm supabase db push   # aplica 023_analytics_schema.sql + ... + 040_capi_key_in_vault.sql
```

Depois, **no Dashboard**: Settings → API → Exposed schemas → adicionar `analytics`.
Sem este passo, a API PostgREST devolve 404 para qualquer `/rest/v1/…` de tabelas do schema.

#### 1a. Popular o CAPI encryption key no Vault (obrigatório a cada projeto novo)

> ⚠️ **Toda vez que você criar um novo projeto Supabase (staging → prod, novo ambiente, clone)**, é preciso repetir este passo **antes** de aplicar a migração `040` — senão o `decrypt_capi_token` falha e o CAPI para em todos os sites.
>
> A migração `040_capi_key_in_vault.sql` espera um secret chamado `analytics.capi_encryption_key` dentro de `vault.secrets`. O valor é a mesma hex key que antes vivia na env var `CAPI_ENCRYPTION_KEY` do worker / web.
>
> 1. Gerar (ou reaproveitar) o hex: `openssl rand -hex 32`
> 2. No SQL Editor do novo projeto Supabase:
>    ```sql
>    SELECT vault.create_secret(
>      'COLE_AQUI_O_HEX_DESTE_AMBIENTE',
>      'analytics.capi_encryption_key'
>    );
>    ```
> 3. Só então aplicar `pnpm supabase db push` (se a 040 rodar sem o secret ela cria as funções, mas o primeiro `decrypt_capi_token` explode).
> 4. Se já houver tokens CAPI cifrados no banco, o hex precisa ser **o mesmo** usado originalmente pra cifrá-los, senão a decriptografia de `pgp_sym_decrypt` falha em massa. Staging e prod são projetos separados — podem usar hex diferentes, desde que cada banco use consistentemente o seu.
> 5. Dar deploy no worker/web **sem** `CAPI_ENCRYPTION_KEY` (essa env var foi retirada em 040).

Para rotacionar o hex depois: `SELECT vault.update_secret((SELECT id FROM vault.secrets WHERE name = 'analytics.capi_encryption_key'), 'NOVO_HEX');` — mas isso invalida todos os tokens já cifrados, então só faz sentido junto com um re-encrypt de todos os `analytics.sites.capi_encrypted_token`.

### 2. Cloudflare API Token

Criar em dash.cloudflare.com/profile/api-tokens com permissão **Account · Analytics · Read**.
Copiar o token e o `Account ID` (disponível em qualquer página do dash).

### 3. Variáveis

**`apps/web/.env.local`**:
```
CF_ACCOUNT_ID=...
CF_AE_API_TOKEN=...
NEXT_PUBLIC_TRACK_SCRIPT_URL=https://track.vibefly.app/s.js
NEXT_PUBLIC_TRACK_ENDPOINT=https://track.vibefly.app/event
```

> `CAPI_ENCRYPTION_KEY` **não é mais** env var. A chave vive no Supabase Vault (ver seção 1a). Deixar resquício dela no env não quebra nada, mas também não é lido por ninguém desde a migração 040.

**Worker secrets**:
```bash
cd apps/track-worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Opcional — habilita verificação HMAC de user_id (ver docs/security-notes).
# wrangler secret put USER_ID_SIGNING_KEY
```

### 4. Deploy

```bash
cd apps/track-worker
pnpm deploy    # pnpm build:tracker && wrangler deploy
```

## Rate limiting

O worker aplica rate limit **per-IP per-isolate** (in-memory) em `src/lib/rate-limit.ts`:

- Janela: 10 s
- Teto: 30 requests / IP / janela / isolate

Tradeoff conhecido: como cada isolate mantém seu próprio Map, o teto global é na prática `isolates × 30`. Para cargas até alguns eventos/segundo/IP isso é suficiente para barrar scripts agressivos. Se precisar de um teto global rígido, migrar para um Durable Object (padrão já usado em `mcp-worker`).

## Observability

`wrangler.toml` tem `observability.enabled = true`. Logs de falha nos sinks são emitidos com prefixos estruturados:

- `sink:postgres:custom_events`
- `sink:postgres:user_profiles`
- `sink:capi`
- `sink:capi:token_missing`

Ver em dash.cloudflare.com → Workers → `track-worker` → Logs.

## Smoke test produção

Depois de criar o primeiro site em `/dashboard/<slug>/analytics/settings`:

1. **Tracker carregou**: `curl -I https://track.vibefly.app/s.js` → 200, `Content-Type: application/javascript`.
2. **Pageview**: abrir o site com o snippet instalado, conferir no DevTools que `POST https://track.vibefly.app/event` retorna 204.
3. **AE gravou**: aguardar ~30 s, abrir `/dashboard/<slug>/analytics` → overview deve mostrar contagem > 0.
4. **Custom event**: no console da página: `window.vibefly.track("Test", { foo: 1 })`.
5. **Postgres gravou**: `/dashboard/<slug>/analytics/events` deve listar o evento `Test`.
6. **CAPI (se configurado)**: Meta Events Manager → Test Events. O evento cai como "website" com IP/UA client-side hashed.

## Limites free-tier

| Recurso                  | Free                          | Quando atinge                          |
| ------------------------ | ----------------------------- | -------------------------------------- |
| Workers invocations      | 100k/dia                      | ~100k eventos/dia                      |
| Analytics Engine writes  | 10k/dia                       | ~10k eventos/dia                       |
| AE SQL API queries       | Grátis na Free                | Ilimitado para dashboards internos     |
| Supabase row inserts     | 500MB DB (~milhões de rows)   | Depende do volume de custom events     |

Migrar para Workers Paid ($5/mês) sobe os dois primeiros limites para 100M/mês cada.

## Troubleshooting

**"Site not found" nas rotas API** — verificar que o `analytics` schema está em Exposed schemas no Supabase Dashboard.

**Events não aparecem no overview** — AE tem latência de ~30 s a 2 min entre write e query. Aguardar antes de concluir que não gravou.

**429 em cima do tracker** — normal em bot scrape; o navegador de um usuário real não estoura 30 rps.

**CAPI "token_missing"** — RPC `decrypt_capi_token` retornou vazio. Causas possíveis:
- O vault secret `analytics.capi_encryption_key` não foi populado neste projeto Supabase (ver seção 1a).
- O hex do vault é diferente do que foi usado pra cifrar o token do site — `pgp_sym_decrypt` falha silenciosamente e a função devolve NULL. Reconfigurar o CAPI access token nesse site (a UI cifra de novo com o hex atual do vault).
