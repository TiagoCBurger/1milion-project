# Plano de Implementação — Integração Hotmart

Status: rascunho para aprovação
Autor: Claude Code
Data: 2026-04-11
Escopo: MVP (produtos, clientes, vendas, reembolsos). Subscriptions e commissions ficam para uma fase 2.

---

## 1. Visão geral

Integrar a API Hotmart ao produto, permitindo que cada workspace conecte sua própria conta Hotmart (token por workspace), importe e mantenha sincronizados produtos, clientes, vendas e reembolsos em tabelas próprias, receba atualizações em tempo real via webhook, e exponha leitura/escrita limitada via MCP tools.

**Fluxo de conexão resumido:**
1. Usuário cria app em `developers.hotmart.com` → obtém `client_id`, `client_secret`, `basic token`.
2. Cola as credenciais no dashboard do workspace.
3. Backend troca por `access_token` (Client Credentials), criptografa e salva.
4. Backend dispara backfill inicial (produtos → vendas → clientes → reembolsos).
5. Backend retorna URL do webhook + `hottok` gerado. UI instrui usuário a colar em `app-postback.hotmart.com` (não há API de criação).
6. A partir daí: webhook mantém dados atualizados em tempo real + botão "Atualizar agora" para reconciliação manual.

---

## 2. Referências da API Hotmart

Fontes consultadas (abril 2026):

| Tópico              | URL                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Autenticação OAuth2 | https://developers.hotmart.com/docs/en/start/app-auth/                                        |
| Listar produtos     | https://developers.hotmart.com/docs/en/v1/product/product-list/                               |
| Histórico de vendas | https://developers.hotmart.com/docs/en/v1/sales/sales-history                                 |
| Sumário de vendas   | https://developers.hotmart.com/docs/en/v1/sales/sales-summary/                                |
| Webhook             | https://developers.hotmart.com/docs/en/1.0.0/webhook/using-webhook/                           |
| Setup webhook UI    | https://help.hotmart.com/en/article/360001491352/how-do-i-set-up-my-product-s-api-using-the-webhook-postback- |

### 2.1 Autenticação

```
POST https://api-sec-vlc.hotmart.com/security/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <BASIC_TOKEN>

grant_type=client_credentials&client_id=<ID>&client_secret=<SECRET>
```

Resposta:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 21600,
  "scope": "read write"
}
```

- Token expira tipicamente em ~6h. Renovar proativamente quando `expires_at - now < 60s`.
- `basic token` é fornecido pela Hotmart na página "Minhas credenciais" e **é obrigatório** no header `Authorization: Basic`.
- Uma vez obtido o `access_token`, chamadas subsequentes usam `Authorization: Bearer <access_token>`.

### 2.2 Base URL da API de dados

```
https://developers.hotmart.com
```

Endpoints usados no MVP:

| Entidade      | Método | Path                                  | Observações                                                                                     |
| ------------- | ------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Produtos      | GET    | `/products/api/v1/products`           | Lista produtos do produtor. Paginação por `page_token` / `next_page_token`.                     |
| Vendas        | GET    | `/payments/api/v1/sales/history`      | Filtros: `product_id`, `start_date`/`end_date` (ms epoch UTC), `transaction_status`, `buyer_email`. |
| Clientes      | GET    | `/payments/api/v1/sales/users`        | Clientes derivados das vendas.                                                                  |
| Reembolsos    | GET    | `/payments/api/v1/sales/history`      | Mesmo endpoint, `transaction_status=REFUNDED`.                                                  |

Paginação: todos os endpoints listados retornam `items` + `page_info.next_page_token`. Loop até não haver mais token, respeitando rate limit.

### 2.3 Webhook (Postback 2.0)

**Fato crítico:** não existe endpoint público da Hotmart para registrar webhooks via API — apenas painel em `app-postback.hotmart.com`. A implementação **sempre** gera URL + `hottok` e exibe instruções para o usuário colar no painel.

Verificação: Hotmart envia o `hottok` no payload JSON (campo `hottok` no root). A verificação é **comparação de igualdade** com o segredo salvo por workspace — não é HMAC. Por isso, o `hottok` tem que entrar na URL como parte da path ou query string **por workspace**, ou ser salvo no `hotmart_credentials` e comparado no receiver.

Decisão: salvar `webhook_hottok` no `hotmart_credentials` por workspace e incluir `workspaceId` na URL do webhook (`/api/integrations/hotmart/webhook/{workspaceId}`). O receiver busca o hottok do workspace e compara.

Eventos do MVP (a processar):

- `PURCHASE_APPROVED` → upsert venda (status=approved), upsert cliente
- `PURCHASE_COMPLETE` → update venda
- `PURCHASE_CANCELED` → update venda (status=canceled)
- `PURCHASE_REFUNDED` → upsert refund + update venda
- `PURCHASE_CHARGEBACK` → update venda (status=chargeback)

Eventos ignorados no MVP (logados só): `PURCHASE_BILLET_PRINTED`, `PURCHASE_DELAYED`, `PURCHASE_EXPIRED`, `PURCHASE_PROTEST`, `PURCHASE_OUT_OF_SHOPPING_CART`, `SUBSCRIPTION_*`, `SWITCH_PLAN`, `CLUB_*`.

Histórico de eventos: Hotmart retém **60 dias**. Backfill inicial busca via API de vendas, não via webhook.

---

## 3. Banco de dados

Nova migration: `supabase/migrations/013_hotmart_integration.sql`.

Todas as tabelas têm: `id UUID PK`, `workspace_id UUID FK → workspaces(id) ON DELETE CASCADE`, `created_at`, `updated_at`, RLS scoped por workspace, `raw JSONB` com payload bruto da Hotmart.

### 3.1 `hotmart_credentials`

| Coluna                   | Tipo         | Notas                                         |
| ------------------------ | ------------ | --------------------------------------------- |
| `workspace_id`           | UUID UNIQUE  | um conjunto de credenciais por workspace      |
| `encrypted_client_id`    | BYTEA        | pgsodium / mesma função usada em `meta_tokens`|
| `encrypted_client_secret`| BYTEA        |                                               |
| `encrypted_basic_token`  | BYTEA        | basic token fornecido pela Hotmart            |
| `encrypted_access_token` | BYTEA        | access token atual                            |
| `token_expires_at`       | TIMESTAMPTZ  | usado para refresh proativo                   |
| `webhook_hottok`         | TEXT         | segredo gerado no connect, salvo em texto (shared secret)|
| `webhook_url`            | TEXT         | URL final exposta para o usuário              |
| `webhook_confirmed_at`   | TIMESTAMPTZ  | set quando recebemos o primeiro POST válido   |
| `is_active`              | BOOLEAN      |                                               |
| `last_sync_at`           | TIMESTAMPTZ  |                                               |

### 3.2 `hotmart_products`

- `hotmart_id` BIGINT (id do produto na Hotmart)
- `name`, `ucode`, `status` (`ACTIVE`/`PAUSED`/`DRAFT`), `format` (`EBOOK`/`ONLINE_COURSE`/...)
- `price_value` NUMERIC, `price_currency` TEXT
- `created_at_hotmart` TIMESTAMPTZ
- `raw` JSONB
- `synced_at` TIMESTAMPTZ
- UNIQUE `(workspace_id, hotmart_id)`

### 3.3 `hotmart_customers`

- `email` TEXT (chave natural)
- `name`, `doc`, `phone`, `country`
- UNIQUE `(workspace_id, email)`
- Índice em `email`

### 3.4 `hotmart_sales`

- `transaction_id` TEXT (ex: `HP15833430150689`)
- `product_id` UUID FK → `hotmart_products(id)` (nullable, pode chegar venda antes do sync de produto)
- `customer_id` UUID FK → `hotmart_customers(id)`
- `status` TEXT (`APPROVED`, `COMPLETE`, `CANCELED`, `REFUNDED`, `CHARGEBACK`, etc)
- `amount` NUMERIC, `currency` TEXT
- `commission_total` NUMERIC (producer_commission)
- `purchase_date` TIMESTAMPTZ
- `payment_type` TEXT (`CREDIT_CARD`, `BILLET`, `PIX`, ...)
- `offer_code` TEXT
- `src` TEXT (origem/campanha)
- UNIQUE `(workspace_id, transaction_id)`
- Índices: `(workspace_id, purchase_date DESC)`, `(workspace_id, status)`, `(workspace_id, product_id)`

### 3.5 `hotmart_refunds`

- `sale_id` UUID FK → `hotmart_sales(id)` ON DELETE CASCADE
- `transaction_id` TEXT (denormalizado p/ lookup)
- `refund_date` TIMESTAMPTZ
- `amount` NUMERIC
- `reason` TEXT
- UNIQUE `(workspace_id, transaction_id)`

### 3.6 `hotmart_webhook_events` (idempotência)

- `event_id` TEXT (id do evento enviado pela Hotmart, campo `id` do payload)
- `event_type` TEXT
- `payload` JSONB
- `received_at` TIMESTAMPTZ
- `processed_at` TIMESTAMPTZ (null = ainda não processado)
- `error` TEXT
- UNIQUE `(workspace_id, event_id)`

### 3.7 `hotmart_sync_log`

- `entity` TEXT (`products`/`sales`/`customers`/`refunds`)
- `started_at`, `finished_at`
- `status` TEXT (`running`/`success`/`error`)
- `records_synced` INT
- `error` TEXT
- `trigger` TEXT (`initial`/`manual`/`webhook`/`cron`)

### 3.8 RLS

Mesmo padrão de `meta_tokens`: somente membros do workspace podem SELECT/INSERT/UPDATE. Service role bypass no worker.

---

## 4. Criptografia de credenciais

Reaproveitar a Edge Function `supabase/functions/decrypt-token` existente, generalizando-a para aceitar `table` e `column` ou adicionar wrappers específicos. Decisão: criar função sibling `decrypt-hotmart-credentials` que retorna `{client_id, client_secret, basic_token, access_token}` de uma vez para evitar 4 chamadas separadas.

Cache em Cloudflare KV:
- Chave: `hotmart:creds:${workspaceId}`
- TTL: 5 min (igual ao Meta)
- Invalidar no reconectar ou on refresh

---

## 5. Cliente HTTP — `apps/mcp-worker/src/hotmart-api.ts`

API stateless, mesmo padrão de `meta-api.ts`:

```ts
export interface HotmartCredentials {
  clientId: string;
  clientSecret: string;
  basicToken: string;
  accessToken: string;
  expiresAt: number;
}

export async function hotmartAuth(
  clientId: string,
  clientSecret: string,
  basicToken: string
): Promise<{ accessToken: string; expiresAt: number } | { error: string }>;

export async function hotmartGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string
): Promise<T | { error: string; status?: number }>;

// Helpers específicos
export async function listProducts(creds, { pageToken? }): Promise<...>;
export async function listSalesHistory(creds, { startDate, endDate, pageToken?, status? }): Promise<...>;
export async function listSalesUsers(creds, { startDate, endDate, pageToken? }): Promise<...>;
```

Regras:
- Nunca expor `access_token` ao cliente (sanitizar `next_page_token` se vier URL completa como no Meta).
- Erros 401 → tentar 1× refresh de token e reexecutar; se falhar de novo, marcar `is_active=false` e retornar erro estruturado.
- Backoff: nenhum retry em 5xx (stateless, worker curto). Caller decide.
- Datas: converter `Date` ↔ milliseconds epoch na borda.
- Paginação: helper `paginate(fn, maxPages=50)` que agrega `items` até acabar `next_page_token` ou atingir limite.

---

## 6. Serviço de Sync — `apps/mcp-worker/src/hotmart-sync.ts`

Assinatura base:

```ts
export async function syncHotmartEntity(
  env: Env,
  workspaceId: string,
  entity: 'products' | 'sales' | 'customers' | 'refunds',
  opts?: { since?: Date; trigger: 'initial' | 'manual' | 'webhook' | 'cron' }
): Promise<SyncResult>;
```

Fluxo por entidade:

1. Abrir linha em `hotmart_sync_log` com `status=running`.
2. Carregar credenciais (KV → fallback Edge Function).
3. Refresh de token se necessário.
4. Paginar endpoint correspondente.
5. Upsert em batch (100/vez) usando `ON CONFLICT (workspace_id, <natural_key>) DO UPDATE`.
6. Atualizar `synced_at`.
7. Fechar `hotmart_sync_log` com `status=success`/`error`.

**Ordem do backfill inicial** (importante para FKs): `products` → `customers` → `sales` → `refunds`. Vendas que referenciem um `product_id` ainda não sincronizado ficam com `product_id=null` e são reconciliadas num segundo passe.

**Sync via webhook**: target cirúrgico. `PURCHASE_APPROVED` → upsert daquela transação e daquele cliente somente, sem varrer histórico.

---

## 7. Fluxo de conexão — Web

### 7.1 UI — `apps/web/src/app/dashboard/[slug]/integrations/hotmart/page.tsx`

Estados:
- **Desconectado**: form com 3 campos (Client ID, Client Secret, Basic Token) + link "Como obter" → help da Hotmart + botão "Conectar".
- **Conectando**: spinner + mensagens ("validando credenciais", "importando produtos", "importando vendas"...).
- **Conectado**: 
  - status de sincronização por entidade (última sync, contagem)
  - botão "Atualizar agora"
  - **bloco de configuração de webhook**: URL + hottok + instruções passo-a-passo de como colar em `app-postback.hotmart.com`, badge "✓ Webhook ativo" quando `webhook_confirmed_at` for setado
  - botão "Desconectar" (confirma modal, apaga credenciais, **não** apaga dados históricos)

### 7.2 API routes

| Route                                                   | Método | Ação                                                                                   |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------- |
| `/api/integrations/hotmart/connect`                     | POST   | valida credenciais, criptografa, gera hottok, dispara backfill em background, retorna URL do webhook |
| `/api/integrations/hotmart/disconnect`                  | POST   | marca `is_active=false`, opcionalmente zera credenciais (dados históricos ficam)       |
| `/api/integrations/hotmart/sync`                        | POST   | `{ entity?: 'all' \| 'products' \| ... }` — dispara sync manual                        |
| `/api/integrations/hotmart/status`                      | GET    | estado de conexão + último sync por entidade                                            |
| `/api/integrations/hotmart/webhook/[workspaceId]`       | POST   | receiver                                                                                |

### 7.3 Receiver do webhook

`apps/web/src/app/api/integrations/hotmart/webhook/[workspaceId]/route.ts`:

1. Parse body JSON.
2. Extrair `hottok`.
3. Buscar `hotmart_credentials` por `workspaceId`.
4. Se `hottok !== credentials.webhook_hottok` → 401 (sem log de payload).
5. Extrair `id` do evento (Hotmart fornece `id` único).
6. Tentar INSERT em `hotmart_webhook_events` com ON CONFLICT DO NOTHING. Se o insert não aconteceu → 200 imediato (duplicata).
7. Setar `webhook_confirmed_at` se ainda não estiver.
8. Responder 200 em <1s.
9. Via `waitUntil()`: despachar para handler por tipo de evento → sync cirúrgico → marcar `processed_at`.
10. Se o handler falhar, registrar `error` na linha de `hotmart_webhook_events` para retry manual.

---

## 8. MCP Tools — `apps/mcp-worker/src/tools/hotmart.ts`

Registro via `registerHotmartTools(ctx)` em `apps/mcp-worker/src/tools/index.ts`.

Gate: permitido para tiers `pro`, `business`, `enterprise` (todos pagos). Bloquear `free` via `TIER_LIMITS.HOTMART_ENABLED` em `packages/shared/src/constants.ts`.

### 8.1 Leitura (consulta tabelas locais)

Todas com filtros `limit` (default 50, max 500), `cursor` para paginação keyset.

- `hotmart_list_products({ status?, search? })`
- `hotmart_get_product({ product_id })`
- `hotmart_list_customers({ search?, email? })`
- `hotmart_get_customer({ customer_id | email })`
- `hotmart_list_sales({ start_date?, end_date?, product_id?, customer_email?, status? })`
- `hotmart_get_sale({ transaction_id })`
- `hotmart_list_refunds({ start_date?, end_date?, product_id? })`

### 8.2 Escrita

- `hotmart_refund_sale({ transaction_id, reason })` — chama API Hotmart. **Requer confirmação dupla** (parâmetro `confirm: true`). Na fase 1, esta tool pode ser omitida se a documentação de refund via API não for clara — incluir só depois de validar contra sandbox.
- `hotmart_trigger_sync({ entity: 'all' | 'products' | 'sales' | 'customers' | 'refunds' })` — dispara sync manual, retorna `sync_id` do `hotmart_sync_log`.

Todas as tools:
- Carregam contexto via `ctx.workspaceId`.
- Retornam `{ data, pagination }` ou `{ error }` consistente com tools existentes.
- Schema Zod por parâmetro, descrição clara (aparece no MCP).

---

## 9. Tier enforcement

Em `packages/shared/src/constants.ts`:

```ts
export const TIER_LIMITS = {
  ...,
  hotmartEnabled: {
    free: false,
    pro: true,
    business: true,
    enterprise: true,
  },
} as const;
```

Checagem em `registerHotmartTools`: se tier é `free`, registra um stub que retorna `{ error: 'Hotmart integration requires a paid plan' }` em vez das tools reais.

---

## 10. Testes de integração

**Regra**: toda entidade coberta no MVP tem teste de integração com mock de HTTP. Padrão existente do repo (`vitest` + `msw` ou fetch mock manual — verificar o padrão de `apps/mcp-worker/src/__tests__/meta-api.test.ts` e replicar).

### 10.1 `apps/mcp-worker/src/__tests__/hotmart-api.test.ts`

- ✓ `hotmartAuth` POSTa com Basic header correto e retorna `access_token`
- ✓ `hotmartAuth` retorna `{ error }` em 401
- ✓ `hotmartGet` inclui `Authorization: Bearer <token>`
- ✓ `hotmartGet` segue `next_page_token` quando chamado via helper `paginate()`
- ✓ Refresh automático em 401 (mock retorna 401 na primeira, 200 na segunda)
- ✓ Sanitização de payload: não expõe URLs com token em logs

### 10.2 `apps/mcp-worker/src/__tests__/hotmart-sync.test.ts`

Para cada entidade (`products`, `sales`, `customers`, `refunds`):
- ✓ Backfill completo persiste N registros com campos mapeados corretamente
- ✓ Upsert: segunda execução não duplica, atualiza `synced_at`
- ✓ Erro da API → `hotmart_sync_log.status=error` com mensagem
- ✓ Ordem do backfill: sales com `product_id` nulo são reconciliadas após sync de products

### 10.3 `apps/mcp-worker/src/__tests__/tools/hotmart.test.ts`

- ✓ `hotmart_list_sales` aplica filtros por data e status
- ✓ `hotmart_list_products` respeita `limit` e paginação
- ✓ Tier `free` → todas as tools retornam erro de gate
- ✓ Tier pago sem `hotmart_credentials` → erro "not connected"
- ✓ `hotmart_trigger_sync({ entity: 'all' })` enfileira os 4 syncs

### 10.4 `apps/web/src/app/api/integrations/hotmart/__tests__/webhook.test.ts`

- ✓ POST sem `hottok` → 401
- ✓ POST com `hottok` inválido → 401
- ✓ POST com `hottok` válido → 200 + insert em `hotmart_webhook_events`
- ✓ POST duplicado (mesmo `event_id`) → 200 idempotente, sem reprocessamento
- ✓ `PURCHASE_APPROVED` → upsert em `hotmart_sales` + `hotmart_customers`
- ✓ `PURCHASE_REFUNDED` → insert em `hotmart_refunds` + update de status
- ✓ Evento fora do MVP → 200, marcado como `processed_at` sem erro
- ✓ Primeiro webhook válido seta `webhook_confirmed_at`

### 10.5 `apps/web/src/app/api/integrations/hotmart/__tests__/connect.test.ts`

- ✓ Credenciais inválidas (401 no auth) → 400 com mensagem amigável
- ✓ Credenciais válidas → criptografa, salva, retorna URL do webhook + hottok
- ✓ Disparo do backfill em background (mock de `waitUntil`)
- ✓ Reconectar regenera `webhook_hottok` e invalida o anterior

### 10.6 Fixtures

Criar `apps/mcp-worker/src/__tests__/fixtures/hotmart/` com:
- `auth-success.json`
- `products-page-1.json` / `products-page-2.json`
- `sales-history-approved.json`
- `sales-history-refunded.json`
- `sales-users.json`
- `webhook-purchase-approved.json`
- `webhook-purchase-refunded.json`

Payloads derivados da documentação oficial. **Não usar dados reais de clientes.**

### 10.7 Teste manual (checklist pré-merge)

- [ ] Conectar com credenciais reais em conta Hotmart de teste
- [ ] Webhook configurado no painel e primeiro evento recebido
- [ ] Backfill inicial completa em < 2 min para conta com < 1000 vendas
- [ ] Botão "Atualizar agora" funciona sem duplicar registros
- [ ] Desconectar + reconectar preserva dados históricos
- [ ] MCP tools respondem via cliente MCP (Claude Desktop)

---

## 11. Plano de entrega (2 PRs)

### PR 1 — Backend + conexão + webhook

**Branch:** `feat/hotmart-integration-backend`

- Migration 013
- `hotmart-api.ts` + testes
- `hotmart-sync.ts` + testes
- Edge Function de decrypt
- API routes web: connect, disconnect, sync, status, webhook receiver + testes
- UI mínima funcional (sem polimento)
- Fixtures + testes de integração (seções 10.1, 10.2, 10.4, 10.5)

Critério de aceite: consigo conectar, fazer backfill, receber webhook e ver dados no Supabase via SQL.

### PR 2 — MCP tools + UI polimento

**Branch:** `feat/hotmart-integration-mcp`

- `tools/hotmart.ts` + registro
- Tier gate
- UI final: estado de sync por entidade, badges de webhook confirmado, mensagens de erro
- Testes (seção 10.3)
- Teste manual ponta-a-ponta via Claude Desktop

Critério de aceite: de um cliente MCP, consigo listar produtos, vendas, clientes e reembolsos de uma conta conectada.

---

## 12. Riscos e pontos em aberto

1. **Refund via API** — a documentação pública não deixa claro se existe endpoint de refund programático. Decisão: **omitir do MVP**. Se o usuário pedir explicitamente, abro uma investigação contra o sandbox.
2. **Rate limit da Hotmart** — não há número oficial público. Estratégia: espaçar chamadas do backfill em batches de 100 com `await sleep(200ms)` entre páginas. Ajustar se aparecer 429.
3. **Backfill de contas grandes** — conta com 100k+ vendas pode estourar o tempo de um worker (30s CPU). Mitigação: backfill inicial roda via endpoint separado que retorna `sync_id` imediatamente e processa em chunks de data (mês a mês) com `waitUntil()` ou cron. Se não couber em 1 worker, fatiar em múltiplas invocações encadeadas.
4. **Webhook sem API de registro** — confirmado. Experiência do usuário fica: "copia esse URL, cola lá". Mitigável só com deep-link se Hotmart um dia publicar o endpoint.
5. **Hottok como shared secret em claro** — não é HMAC, é comparação. Isso significa que quem tiver a URL do webhook + hottok pode forjar requests. Mitigação: URL inclui `workspaceId` opaco (UUID), hottok é gerado com `crypto.randomUUID()` de 32+ chars, rotacionável via reconnect.
6. **Subscriptions e commissions** — fora do MVP mas as tabelas podem ser adicionadas na mesma migration para evitar migration #2 só para isso. Decidir antes de codar.

---

## 13. Decisões pendentes

Antes de começar a implementar, preciso de confirmação em:

1. **Tabelas de subscriptions/commissions na migration 013** (mesmo sem código)? Sim/Não
2. **Incluir `hotmart_refund_sale` no MVP** mesmo sem confirmação da API? Sim/Não
3. **Divisão em 2 PRs** como proposto na seção 11, ou PR único?
4. **Nome do tier gate** — `hotmartEnabled` ou seguir padrão existente de algum outro gate?
