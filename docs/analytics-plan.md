# Analytics Feature — Implementation Plan

Plano de construção da feature de web analytics (inspirada em [Rybbit](https://github.com/rybbit-io/rybbit), adaptada ao stack Vibefly).

## Arquitetura

```
Browser (site do cliente)
  <script src="track.vibefly.app/s.js" data-site-id="site_..."></script>
         │
         │ POST /event
         ▼
apps/track-worker (Cloudflare Worker)
  1. Validate + Zod
  2. Lookup site por public_key (Supabase REST, schema analytics)
  3. Enrich: req.cf (geo) + UA parse + channel detect + bot filter
  4. Sinks paralelos (ctx.waitUntil):
     a) Analytics Engine  writeDataPoint  ← TODOS eventos (schema fixo)
     b) Postgres analytics.custom_events  ← só event_type=custom
     c) Meta CAPI (graph.facebook.com)    ← se pixel_id + nome em Meta Standard Events
     d) Upsert analytics.user_profiles    ← se payload.user tem dados
  5. 204 No Content
         │
   ┌─────┴─────┐
   ▼           ▼
   AE          Supabase Postgres
   (pageviews  (sites, custom_events,
    outbound,   user_profiles, goals,
    perf,       funnels)
    markers)
         ▲
         │  SQL HTTP API
         │
apps/web (Next.js route handlers)
  /api/analytics/[siteId]/overview    → AE
  /api/analytics/[siteId]/timeseries  → AE
  /api/analytics/[siteId]/top         → AE
  /api/analytics/[siteId]/live        → AE
  /api/analytics/[siteId]/events      → AE ∪ Postgres
  /api/analytics/[siteId]/conversions → Postgres
         │
         ▼
apps/web/src/app/dashboard/[slug]/analytics/*
```

## Storage split

| Dado                              | Onde                             | Por quê                                              |
| --------------------------------- | -------------------------------- | ---------------------------------------------------- |
| Pageview / outbound / performance | Cloudflare Analytics Engine      | Alto volume, schema fixo, query colunar, grátis      |
| Custom event marker (sem props)   | Analytics Engine                 | Para time-series de conversões                       |
| Custom event completo (com props) | Postgres `analytics.custom_events` | Props JSONB, dedup CAPI, retenção infinita          |
| Sites / Goals / Funnels           | Postgres `analytics.*`           | Relacional, RLS, configuração                        |
| User profiles / traits            | Postgres `analytics.user_profiles` | Upsert, merge traits, lookup por email_hash        |
| Active sessions (live count)      | Query AE direto                  | Evita writes no hot path                             |

## Custo estimado (1000 workspaces, ~150M eventos/mês)

| Serviço                         | Custo/mês |
| ------------------------------- | --------- |
| Cloudflare Workers Paid         | $5 (inclui 100M AE writes) |
| Analytics Engine overage (~50M) | $12.50    |
| Supabase Pro                    | $25       |
| **Total**                       | **~$45**  |

Inicial (Free tier): Workers Free dá 10k AE writes/dia (300k/mês) — suficiente para validar.

## Cloudflare Analytics Engine — schema do data point

Dataset único: `vibefly_events` (20 blobs + 20 doubles + 1 index).

| Slot       | Campo              |
| ---------- | ------------------ |
| `index1`   | site_id (UUID)     |
| `blob1`    | event_type         |
| `blob2`    | event_name         |
| `blob3`    | session_id         |
| `blob4`    | user_id            |
| `blob5`    | hostname           |
| `blob6`    | pathname           |
| `blob7`    | page_title         |
| `blob8`    | referrer_domain    |
| `blob9`    | referrer_path      |
| `blob10`   | channel            |
| `blob11-15`| utm_source/medium/campaign/term/content |
| `blob16`   | country (ISO2)     |
| `blob17`   | region             |
| `blob18`   | browser            |
| `blob19`   | os                 |
| `blob20`   | device_type        |
| `double1`  | value (conversão)  |
| `double2-3`| screen_width/height|
| `double4-5`| lat/lon            |
| `double6-10`| lcp/cls/inp/fcp/ttfb |
| `double11-20`| reservado        |

Timestamp é built-in (gerado pelo AE).

## Postgres schema (`analytics`)

Migration: `supabase/migrations/023_analytics_schema.sql`

Tabelas:

- `analytics.sites` — domínios rastreados (1 workspace → N sites)
- `analytics.custom_events` — event_id (dedup), event_name, props JSONB, capi_sent
- `analytics.user_profiles` — site_id + user_id, traits JSONB
- `analytics.goals` — conversões nomeadas (pageview ou event-based)
- `analytics.funnels` — multi-step com steps JSONB
- Functions: `analytics.encrypt_capi_token`, `analytics.decrypt_capi_token`

RLS: members do workspace leem; owners/admins escrevem configs.

**Manual step obrigatório** após rodar a migration:
Supabase Dashboard → Project Settings → API → Exposed schemas → adicionar `analytics`.

## Estrutura de arquivos

### `apps/track-worker/` (reescrito)

```
src/
  index.ts                          # router: /s.js, /event, /health
  types.ts                          # Env, AnalyticsPayload, SiteConfig
  handlers/
    event.ts                        # orquestração event
    script.ts                       # serve tracker.js
    health.ts
  enrich/
    geo.ts                          # req.cf → {country, region, city, lat, lon}
    ua.ts                           # ua-parser-js
    channel.ts                      # UTM + referrer → channel
    session.ts                      # extract session_id/user_id
    bot.ts                          # isbot + heuristics
  sinks/
    analytics-engine.ts             # writeDataPoint
    postgres.ts                     # REST INSERT (headers Content-Profile: analytics)
    meta-capi.ts                    # hash PII + CAPI POST
  tracker/
    script.template.ts              # fonte TS do tracker browser
    build.ts                        # build-time compila para string const
  lib/
    cache.ts                        # LRU site config (public_key → SiteConfig)
    cors.ts
    hash.ts                         # sha256 lowercase
    validation.ts                   # Zod schemas
    site-lookup.ts                  # fetch Supabase REST
__tests__/
  enrich.test.ts
  sinks.test.ts
  event-handler.test.ts
```

### `apps/web/`

```
src/
  lib/analytics/
    ae-client.ts                    # AE SQL API client
    queries.ts                      # SQL templates
    auth.ts                         # getSiteWithMembership
    types.ts                        # response shapes
  lib/supabase/
    analytics.ts                    # createAnalyticsClient (schema: "analytics")
  app/api/analytics/[siteId]/
    overview/route.ts
    timeseries/route.ts
    top/route.ts
    events/route.ts
    live/route.ts
    conversions/route.ts
  app/dashboard/[slug]/analytics/
    layout.tsx                      # sub-nav
    page.tsx                        # dashboard principal
    conversions/page.tsx
    events/page.tsx
    settings/page.tsx               # sites + pixel + install snippet
  components/analytics/
    site-selector.tsx
    time-range-picker.tsx
    live-counter.tsx                # polling 10s
    overview-stats.tsx              # 4 cards
    timeseries-chart.tsx            # recharts area
    top-table.tsx                   # reusable
    install-snippet.tsx
    conversions-table.tsx
    event-explorer.tsx
```

### Deletar

- `apps/web/src/app/dashboard/[slug]/tracking/` (era teste)
- `apps/web/src/app/dashboard/[slug]/rastreamento-avancado/` (placeholder)

## Fases

### Fase 0 — Foundation (1 dia)

- [ ] Migration 023 (schema + tabelas + RLS + helpers)
- [ ] `wrangler.toml` com binding `ANALYTICS`
- [ ] `package.json` track-worker com deps (isbot, ua-parser-js, zod, esbuild)
- [ ] Estrutura vazia de pastas
- [ ] `.env.local.example` atualizado
- [ ] Manual: adicionar schema `analytics` aos Exposed schemas no dashboard Supabase
- [ ] Manual: criar token CF com `Account Analytics: Read` permission

### Fase 1 — Ingestão E2E (2 dias)

Dia 1 — Enrichers + tracker:
- Enrichers: geo, ua, channel, bot
- Validation (Zod)
- Cache + site-lookup
- Tracker script + build

Dia 2 — Sinks + orquestração:
- writeDataPoint AE
- INSERT Postgres (Content-Profile: analytics)
- Meta CAPI com hash PII
- Event handler
- Testes vitest
- Smoke test: `window.vibefly.track("Test")` → AE + Postgres + CAPI

### Fase 2 — Query API (2 dias)

Dia 1 — core:
- ae-client + sanitizers
- auth helper
- /overview
- /live

Dia 2 — resto:
- /timeseries
- /top
- /events (UNION AE + Postgres)
- /conversions (Postgres)

### Fase 3 — Dashboard UI (2-3 dias)

Dia 1 — estrutura + hero
Dia 2 — chart + top tables
Dia 3 — conversions + events + empty states

### Fase 4 — Config UI (1 dia)

- settings/page.tsx (sites CRUD, Pixel, install snippet)
- Deletar pages antigas
- Atualizar sidebar

### Fase 5 — Polish (1 dia)

- Rate limit via Durable Object
- Error logging
- Docs
- Smoke test produção

**Total: 9-11 dias**

## Status atual (2026-04-17)

Fases 0-5 implementadas. Ver `docs/analytics-ops.md` para deploy, variáveis, rate limit e smoke test.

Tradeoff Fase 5: rate limit ficou in-memory per-isolate (não DO) — suficiente para MVP e free tier; migrar para DO se precisar de teto global rígido.

## Environment variables

### Worker secrets (`wrangler secret put`)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CAPI_ENCRYPTION_KEY
```

### Next.js (`.env.local`)

```
CF_ACCOUNT_ID
CF_AE_API_TOKEN
CAPI_ENCRYPTION_KEY
NEXT_PUBLIC_TRACK_SCRIPT_URL=https://track.vibefly.app/s.js
NEXT_PUBLIC_TRACK_ENDPOINT=https://track.vibefly.app/event
```

## Decisões chave registradas

1. **Schema separado `analytics`**: organização, evita poluir `public`.
2. **Pixel/CAPI per-site**: um workspace pode ter múltiplos sites com Pixels diferentes.
3. **Híbrido AE + Postgres**: AE é fonte para aggregates; Postgres guarda detalhes/props.
4. **Live count via AE**: zero writes no hot path.
5. **Track-worker reescrito**: código anterior era teste, sem compat.
6. **Rota `/event` unificada**: dispara AE + Postgres + CAPI condicionalmente.
