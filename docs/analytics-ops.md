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
pnpm supabase db push   # aplica 023_analytics_schema.sql
```

Depois, **no Dashboard**: Settings → API → Exposed schemas → adicionar `analytics`.
Sem este passo, a API PostgREST devolve 404 para qualquer `/rest/v1/…` de tabelas do schema.

### 2. Cloudflare API Token

Criar em dash.cloudflare.com/profile/api-tokens com permissão **Account · Analytics · Read**.
Copiar o token e o `Account ID` (disponível em qualquer página do dash).

### 3. Variáveis

**`apps/web/.env.local`**:
```
CF_ACCOUNT_ID=...
CF_AE_API_TOKEN=...
CAPI_ENCRYPTION_KEY=<mesma string do worker>
NEXT_PUBLIC_TRACK_SCRIPT_URL=https://track.vibefly.app/s.js
NEXT_PUBLIC_TRACK_ENDPOINT=https://track.vibefly.app/event
```

**Worker secrets**:
```bash
cd apps/track-worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put CAPI_ENCRYPTION_KEY
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

**CAPI "token_missing"** — RPC `decrypt_capi_token` retornou vazio. Provável causa: `CAPI_ENCRYPTION_KEY` do worker diferente da que foi usada para encriptar via Next.js. Reconfigurar o token no site.
