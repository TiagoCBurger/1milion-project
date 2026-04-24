# Security Assessment Report — VibeFly

**Data:** 2026-04-24  
**Ferramenta:** Shannon AI Pentester v1.1.0 (Keygraph)  
**Duração:** 146 minutos | 11 agentes paralelos  
**Escopo:** Autenticação, XSS, SQL/Command Injection, SSRF, Autorização  

---

## Resumo Executivo

| Severidade | Vulns confirmadas | Corrigidas | Pendentes |
|---|---|---|---|
| 🔴 Crítico | 1 | 1 | 0 |
| 🔴 Alto | 7 | 5 | 2 |
| 🟠 Médio | 2 | 2 | 0 |
| 🟡 Info | 3 | 2 | 1 |
| ✅ Sem vuln | XSS, SSRF, IDOR/Authz | — | — |

**Principais achados:** account takeover via troca de senha sem re-auth, 5 endpoints de Meta API com path traversal confirmado (fbtrace_id real), OAuth do MCP Worker sem autenticação e sem rate limit, e account enumeration via signup.

**Última atualização de fixes:** 2026-04-24

---

## Índice

1. [AUTH-VULN-05 — Account Takeover (Crítico)](#auth-vuln-05)
2. [INJ-VULN-01~05 — Meta API Path Traversal (Alto)](#inj-vuln-01-05)
3. [AUTH-VULN-06 — OAuth Client Registration sem Auth (Alto)](#auth-vuln-06)
4. [AUTH-VULN-07 — MCP OAuth sem Rate Limit (Alto)](#auth-vuln-07)
5. [AUTH-VULN-02 — Account Enumeration via Signup (Alto)](#auth-vuln-02)
6. [AUTH-VULN-08 — Sem Lockout por Conta (Alto)](#auth-vuln-08)
7. [AUTH-VULN-01 — Política de Senha Fraca (Alto)](#auth-vuln-01)
8. [AUTHZ-VULN-01 — Open Redirect em /auth/confirm (Médio)](#authz-vuln-01)
9. [AUTH-VULN-04 — Pre-registration Account Squatting (Médio)](#auth-vuln-04)
10. [Misconfigurations gerais (Info)](#misconfigurations)
11. [O que está seguro](#o-que-esta-seguro)

---

## AUTH-VULN-05 — Troca de Senha sem Re-autenticação {#auth-vuln-05}

**Severidade:** 🔴 Crítico  
**Exploited:** Sim (Level 4 — Account Takeover demonstrado)  
**Status:** ✅ Corrigido em 2026-04-24 — "Secure password change" e "Require current password when updating" habilitados no Supabase Dashboard (confirmado via screenshot)

### Descrição

Qualquer `access_token` válido consegue trocar a senha da conta **sem fornecer a senha atual**. Um atacante que obtiver um session token (via cookie theft, XSS, MITM, etc.) pode trocar a senha imediatamente, bloqueando o usuário legítimo permanentemente.

**Root cause:** O projeto Supabase cloud não tem **current password enforcement** ativo. A proteção de reauthentication por tempo (24h) não é suficiente — Shannon tinha sessão nova e passou sem restrição. Importante: `config.toml` **não sincroniza** com o projeto cloud; as configurações de segurança do cloud precisam ser ajustadas direto no Supabase Dashboard.

> ⚠️ Nota: este exploit foi provado ao vivo no projeto cloud (`supabase.co`) — não no ambiente local.

### PoC

```bash
# 1. Atacante obtém access_token (ex: rouba cookie de sessão)
ACCESS_TOKEN="eyJhbGci..."

# 2. Troca a senha SEM fornecer a senha atual
curl -X PUT "https://<SUPABASE_URL>/auth/v1/user" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "nova_senha_do_atacante"}'
# → HTTP 200 — senha trocada com sucesso

# 3. Vítima não consegue mais logar com a senha original
# → HTTP 400 "invalid_credentials"
```

### Fix

**No Supabase Dashboard** (não no config.toml — que não sincroniza com cloud):

1. Acessar: **Authentication → Policies → Password Security**
2. Habilitar **"Require current password on password change"**

Isso força o usuário a fornecer a senha atual antes de trocar — um session token roubado sozinho não é suficiente.

Alternativamente, implementar no próprio app:

```typescript
// apps/web/src/app/api/auth/change-password/route.ts
// Verificar senha atual antes de aceitar a nova
const { error } = await supabase.auth.signInWithPassword({
  email: session.user.email,
  password: body.currentPassword,
});
if (error) return Response.json({ error: 'Senha atual incorreta' }, { status: 400 });

await supabase.auth.updateUser({ password: body.newPassword });
```

---

## INJ-VULN-01~05 — Meta Graph API Path Traversal {#inj-vuln-01-05}

**Severidade:** 🔴 Alto (5 vulnerabilidades)  
**Exploited:** Sim — `fbtrace_id` únicos da Meta API confirmam requests reais  
**Status:** ✅ Corrigido em 2026-04-24 — `validateMetaId()` adicionado em `apps/web/src/lib/meta-api.ts` e aplicado nos 5 endpoints (`campaigns/[campaignId]`, `campaigns`, `adsets`, `ads`, `creatives`). IDs com formato inválido retornam HTTP 400 antes de chegar à Meta API.

### Descrição

A função `metaApiPost()` em `apps/web/src/lib/meta-api.ts:217` constrói a URL da Meta API por concatenação direta de parâmetros controlados pelo usuário, **sem nenhuma validação de formato ou allowlist**:

```typescript
// apps/web/src/lib/meta-api.ts:217
const url = `${BASE_URL}/${endpoint}`; // ← endpoint vem do atacante
```

Um usuário autenticado como `owner` ou `admin` de uma organização pode usar URLs como `me%2Faccounts` (slash URL-encoded) para navegar para qualquer endpoint da Meta Graph API usando o token da organização.

### Endpoints afetados

| ID | Endpoint | Parâmetro vulnerável | Arquivo |
|---|---|---|---|
| INJ-VULN-01 | `PATCH /api/organizations/[id]/meta/campaigns/[campaignId]` | `campaignId` (URL path) | `campaigns/[campaignId]/route.ts:9` |
| INJ-VULN-02 | `POST /api/organizations/[id]/meta/campaigns` | `account_id` (body) | `campaigns/route.ts:68` |
| INJ-VULN-03 | `POST /api/organizations/[id]/meta/adsets` | `account_id` (body) | `adsets/route.ts:87` |
| INJ-VULN-04 | `POST /api/organizations/[id]/meta/ads` | `account_id` (body) | `ads/route.ts:95` |
| INJ-VULN-05 | `POST /api/organizations/[id]/meta/creatives` | `account_id` (body) | `creatives/route.ts:100` |

### PoC (INJ-VULN-01)

```bash
# Atacante com conta + org + Meta token conectado
# Navega para me/adaccounts usando %2F (slash encoded)
curl -X PATCH "https://vibefly.app/api/organizations/[ORG_ID]/meta/campaigns/me%2Fadaccounts" \
  -H "Cookie: sb-...-auth-token=[SESSION_COOKIE]" \
  -H "Content-Type: application/json" \
  -d '{"status": "PAUSED"}'

# Servidor faz POST para: https://graph.facebook.com/v24.0/me/adaccounts
# com o token Meta da organização

# Resposta confirma request chegou na Meta:
# {"error": "Invalid OAuth access token data.", "fbtrace_id": "AbhJCUSXvlayP5cp9FXUKnj"}
# ↑ fbtrace_id real — request chegou nos servidores da Facebook
```

### Fix

Validar `campaignId` e `account_id` com regex estrito **antes** de passar para `metaApiPost()`:

```typescript
// apps/web/src/lib/meta-api.ts — adicionar função de validação
const CAMPAIGN_ID_REGEX = /^\d+$/;
const ACCOUNT_ID_REGEX = /^(act_)?\d+$/;

export function validateMetaId(id: string, type: 'campaign' | 'account'): string {
  const regex = type === 'campaign' ? CAMPAIGN_ID_REGEX : ACCOUNT_ID_REGEX;
  if (!regex.test(id)) {
    throw new Error(`Invalid Meta ${type} ID format`);
  }
  return id;
}

// Em cada route antes de chamar metaApiPost:
const safeCampaignId = validateMetaId(params.campaignId, 'campaign');
const safeAccountId = validateMetaId(body.account_id, 'account');
```

---

## AUTH-VULN-06 — OAuth Client Registration sem Autenticação {#auth-vuln-06}

**Severidade:** 🔴 Alto  
**Exploited:** Sim (Level 3 — infraestrutura de phishing operacional)  
**Status:** ✅ Corrigido em 2026-04-24 — allowlist de `redirect_uri` implementada em `apps/mcp-worker/src/oauth/register.ts`. Apenas `vibefly.app`, `app.vibefly.app`, `localhost` e `127.0.0.1` são aceitos. URIs fora dessa lista retornam HTTP 400 `invalid_redirect_uri`.

### Descrição

O endpoint `POST /register` do MCP Worker (RFC 7591 dynamic client registration) **não requer autenticação**. Qualquer pessoa pode registrar clientes OAuth com `redirect_uri` arbitrários apontando para servidores maliciosos, que são imediatamente aceitos no fluxo de autorização exibindo o `client_name` do atacante para a vítima.

### PoC

```bash
# 1. Registrar cliente malicioso sem autenticação
curl -X POST "https://mcp-worker.ticburger.workers.dev/register" \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Legitimate VibeFly Tool",
    "redirect_uris": ["https://evil-attacker.com/steal-tokens"]
  }'
# → HTTP 200 com client_id válido

# 2. URL de phishing — exibe "Legitimate VibeFly Tool" para a vítima
# https://mcp-worker.ticburger.workers.dev/authorize?client_id=<CLIENT_ID>&...&redirect_uri=https://evil-attacker.com/steal-tokens

# 3. Quando vítima aprova → código de autorização enviado para evil-attacker.com
```

### Fix

**Opção A (recomendada):** Requerer Bearer token para `/register`:

```typescript
// apps/mcp-worker/src/oauth/register.ts
async function handleRegister(request: Request, env: Env) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || token !== env.REGISTRATION_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... resto do handler
}
```

**Opção B:** Allowlist de domínios para `redirect_uri`:

```typescript
const ALLOWED_REDIRECT_DOMAINS = ['vibefly.app', 'localhost'];

function validateRedirectUri(uri: string): boolean {
  const url = new URL(uri);
  return ALLOWED_REDIRECT_DOMAINS.includes(url.hostname);
}
```

---

## AUTH-VULN-07 — MCP OAuth sem Rate Limiting {#auth-vuln-07}

**Severidade:** 🔴 Alto  
**Exploited:** Sim — 30 requests em 2 segundos sem throttle  
**Status:** ✅ Corrigido em 2026-04-24 — `checkOAuthIpRateLimit()` adicionado em `apps/mcp-worker/src/rate-limit.ts` (30 req/min por IP). Aplicado em `index.ts` **antes** de `routeOAuth()` para `/authorize`, `/token`, `/register` e `/revoke`. Excede o limite → HTTP 429 com `Retry-After: 60`.

### Descrição

Os endpoints `/token` e `/authorize` do MCP Worker são roteados **antes** do middleware de rate limit (Durable Object), fazendo com que o rate limiter nunca seja aplicado ao OAuth. 30 requests consecutivos completaram em 2 segundos sem nenhum 429.

### Fix

```typescript
// apps/mcp-worker/src/index.ts — mover rate limit para antes do routeOAuth
export default {
  async fetch(request: Request, env: Env) {
    // Rate limit deve ser aplicado ANTES de qualquer roteamento
    const rateLimitResult = await checkRateLimit(request, env);
    if (rateLimitResult) return rateLimitResult;
    
    // Agora rotear OAuth
    if (isOAuthRequest(request)) {
      return routeOAuth(request, env);
    }
    // ...
  }
}
```

---

## AUTH-VULN-02 — Account Enumeration via Signup {#auth-vuln-02}

**Severidade:** 🔴 Alto  
**Exploited:** Sim — ~360 emails/hora por IP  
**Status:** ✅ Corrigido em 2026-04-24 — criada rota server-side `apps/web/src/app/api/auth/signup/route.ts` que normaliza todas as respostas para a mesma mensagem genérica independente de o email existir ou não. Erros de política de senha são os únicos expostos (seguros). Rate limiting de 5 req/15 min por IP adicionado. Signup page atualizada para usar a rota. Testado em `src/__tests__/auth-signup-route.test.ts` (8 testes).

### Descrição

O endpoint de signup retorna respostas **distintas** para emails registrados vs. não registrados:

| Email | HTTP Status | Resposta |
|---|---|---|
| **Registrado** | 200 | Objeto user com `id`, `confirmation_sent_at` |
| **Não registrado** | 500 | `"Error sending confirmation email"` |

Isso permite enumerar todos os emails cadastrados na plataforma.

### Fix

Normalizar a resposta no servidor para retornar sempre o mesmo status e mensagem, independente se o email existe:

```typescript
// apps/web/src/app/(auth)/signup/actions.ts (ou similar)
try {
  await supabase.auth.signUp({ email, password });
} catch (error) {
  // NUNCA expor detalhes diferentes por email existente vs não existente
}

// Sempre retornar a mesma mensagem genérica:
return { message: 'Se este email não estiver cadastrado, você receberá um link de confirmação.' };
```

Alternativamente, configurar SMTP corretamente elimina a diferença de comportamento.

---

## AUTH-VULN-08 — Sem Lockout por Conta {#auth-vuln-08}

**Severidade:** 🔴 Alto  
**Exploited:** Sim — 31 tentativas falhas sem lockout  
**Status:** ✅ Corrigido em 2026-04-24 — criada rota server-side `apps/web/src/app/api/auth/login/route.ts` com lockout por conta: 5 falhas consecutivas bloqueiam o email por 15 min, independente de rotação de IP. "Email not confirmed" não conta como falha. Login page atualizada para usar a rota e exibir mensagem de lockout. Testado em `src/__tests__/auth-login-route.test.ts` (9 testes).

### Descrição

O rate limit do Supabase Auth é **apenas por IP**, nunca por conta. Com 150ms de delay entre requests, 93 tentativas foram feitas sem nenhum 429. Com rotação de IP, um atacante pode fazer tentativas ilimitadas contra qualquer conta específica.

### Fix

Habilitar proteção no Supabase:

```toml
# supabase/config.toml
[auth]
# Bloquear conta após N tentativas falhas
max_failed_attempts = 10
```

Ou implementar CAPTCHA no frontend após N falhas:

```typescript
// apps/web/src/app/(auth)/login/page.tsx
const [failedAttempts, setFailedAttempts] = useState(0);

// Mostrar CAPTCHA após 5 tentativas falhas
{failedAttempts >= 5 && <CaptchaChallenge onVerify={setCaptchaToken} />}
```

---

## AUTH-VULN-01 — Política de Senha Fraca {#auth-vuln-01}

**Severidade:** 🔴 Alto  
**Exploited:** Sim — login com `abc123` (6 chars) confirmado  
**Status:** ✅ Corrigido em 2026-04-24 — `minimum_password_length = 12` e `password_requirements = "lower_upper_letters_digits_symbols"` no `supabase/config.toml`. Confirmado no Supabase Dashboard com comprimento mínimo 12 e requisito "Lowercase, uppercase letters, digits and symbols (recommended)". UI de signup atualizada com checklist live de requisitos.

### Descrição

O backend aceita senhas de apenas 6 caracteres sem requisitos de complexidade (`supabase/config.toml:175`). A UI mostra `minLength=8`, mas isso é uma validação client-side facilmente ignorada via chamada direta à API.

### Fix

```toml
# supabase/config.toml
[auth.password]
minimum_password_length = 12
password_requirements = "lower_upper_digits_symbols"  # ou pelo menos "lower_upper_digits"
```

---

## AUTHZ-VULN-01 — Open Redirect em /auth/confirm {#authz-vuln-01}

**Severidade:** 🟠 Médio  
**Exploited:** Confirmado em código; PoC ao vivo bloqueado por limitação do test env  
**Status:** ✅ Corrigido em 2026-04-24 — validação alterada para `next.startsWith("/") && !next.startsWith("//")` em `apps/web/src/lib/supabase/middleware.ts` e em `apps/web/src/app/(auth)/auth/confirm/page.tsx`. URLs protocol-relative como `//evil.com` são bloqueadas e redirecionam para `/dashboard`.

### Descrição

O parâmetro `next` em `/auth/confirm?next=<valor>` usa `startsWith("/")` para validação, que aceita URLs protocol-relative como `//evil.com`. O browser interpreta `//evil.com` como `https://evil.com`, resultando em redirect para domínio externo.

**Chain:**
1. `middleware.ts:35`: `next.startsWith("/")` → `//evil.com` passa ✓
2. `page.tsx:22-28`: mesma verificação, depois `router.push("//evil.com")`
3. Next.js App Router: `//evil.com` é tratado como URL externa → `location.assign("//evil.com")`

### Fix

```typescript
// apps/web/src/lib/supabase/middleware.ts
function isSafeRedirect(url: string): boolean {
  if (!url.startsWith('/')) return false;
  if (url.startsWith('//')) return false;  // ← bloquear protocol-relative
  return true;
}

const destination = isSafeRedirect(next) ? next : '/dashboard';
```

---

## AUTH-VULN-04 — Pre-registration Account Squatting {#auth-vuln-04}

**Severidade:** 🟠 Médio  
**Status original:** Identificado em código; bloqueado na prática por SMTP não configurado no staging  
**Status:** ✅ Corrigido em 2026-04-24 — `enable_confirmations = true` em `supabase/config.toml`. Com confirmação obrigatória, um email não pode ser "ocupado" por um atacante pois a conta só é ativada após o dono do email clicar no link.

### Descrição

Com `enable_confirmations = false` no config do Supabase, contas são criadas sem confirmação de email. Isso permite que um atacante "ocupe" um email antes do dono legítimo, bloqueando o cadastro real.

### Fix

```toml
# supabase/config.toml
[auth]
enable_confirmations = true   # Requer confirmação de email sempre
```

---

## Misconfigurations Gerais {#misconfigurations}

### 1. Sem Content Security Policy (CSP)

**Status:** ✅ Corrigido em 2026-04-24 — CSP adicionado em `apps/web/next.config.ts` cobrindo `default-src`, `script-src`, `style-src`, `img-src`, `connect-src`, `frame-src`, `object-src`, `base-uri` e `form-action`.

A aplicação tem HSTS, `X-Frame-Options: DENY`, etc., mas **falta CSP**. Sem CSP, qualquer XSS que venha a ser descoberto futuramente terá impacto máximo.

```typescript
// apps/web/next.config.ts
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
      "img-src 'self' data: https:",
      "connect-src 'self' https://*.supabase.co https://graph.facebook.com",
    ].join('; ')
  }
];
```

### 2. API Internas sem IP Allowlist

**Status:** ✅ Corrigido em 2026-04-24 — criado `apps/web/src/lib/internal-api-auth.ts` com validação de token + IP allowlist opcional via `INTERNAL_API_ALLOWED_IPS` (comma-separated). Quando configurado, bloqueia requests de IPs não listados com 403. Backward-compatible (sem a env var, só token é verificado). Endpoints `meta-token/refresh` e `billing/notify-dunning` refatorados para usar o utilitário. Testado em `src/__tests__/internal-api-ip.test.ts` (13 testes).

Os endpoints `/api/internal/meta-token/refresh`, `/api/internal/billing/notify-dunning` e `/api/internal/test-emails` dependem apenas de um header secreto `x-internal-api-token`. Se esse secret vazar (logs, error traces, env dump), qualquer pessoa na internet consegue chamá-los.

**Fix:** Adicionar validação de origem:

```typescript
// apps/web/src/app/api/internal/_middleware.ts
const ALLOWED_ORIGINS = ['127.0.0.1', '::1']; // ou ranges do Cloudflare Workers

export function validateInternalRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  return ALLOWED_ORIGINS.some(ip => forwarded?.startsWith(ip));
}
```

### 3. MCP Worker CORS `*`

**Status:** ✅ Corrigido em 2026-04-24 — endpoints `/register`, `/token` e `/revoke` agora retornam `Access-Control-Allow-Origin` apenas para origens autorizadas (`vibefly.app`, `app.vibefly.app`). Requests de outras origens não recebem o header, bloqueando o CORS no browser. Endpoint `/mcp` mantém `*` (autenticado via Bearer token).

`Access-Control-Allow-Origin: *` em todos os endpoints do MCP Worker permite POST cross-origin de qualquer site para `/register`, amplificando AUTH-VULN-06.

**Fix:** Restringir CORS no worker:

```typescript
const ALLOWED_ORIGINS = ['https://vibefly.app', 'https://app.vibefly.app'];

function getCorsHeaders(origin: string | null) {
  return ALLOWED_ORIGINS.includes(origin ?? '')
    ? { 'Access-Control-Allow-Origin': origin! }
    : {};
}
```

---

## O que está seguro {#o-que-esta-seguro}

Shannon testou extensivamente e **não encontrou vulnerabilidades** nas seguintes áreas:

| Área | Status | Detalhes |
|---|---|---|
| **XSS** | ✅ Seguro | React JSX auto-escapa em todos os contextos testados (display_name, org name, breadcrumbs, RSC JSON). Nenhum `dangerouslySetInnerHTML` com input não-sanitizado encontrado. |
| **SSRF** | ✅ Seguro | `safeFetch()` em `packages/sanitizer/src/ssrf.ts` tem cobertura abrangente: block de IPs privados, protocolo, porta e re-validação em redirect. Único risco teórico é DNS rebinding (requer infra controlada com TTL rápido — prático baixo). |
| **IDOR / Authz horizontal** | ✅ Seguro | Analytics (`getSiteAccess()`), billing, ad-accounts toggle, projects — todos protegidos corretamente com verificação de membership antes de qualquer operação. |
| **SQL Injection** | ✅ Seguro | Queries Supabase usam `assertUuid()`, `quoteLiteral()` e parâmetros tipados. Nenhum raw SQL com interpolação de user input encontrado. |
| **Stored XSS via Meta Ads** | ✅ Seguro | Dados da Meta API são renderizados via React, escapando automaticamente. |

---

## Plano de Priorização de Fixes

### Agora (antes do próximo deploy) — ✅ Concluído

1. ✅ **`supabase/config.toml`**: `secure_password_change = true` — já estava ativo; confirmado no Dashboard
2. ✅ **`supabase/config.toml`**: `minimum_password_length = 12` + `password_requirements = "lower_upper_letters_digits_symbols"`
3. ✅ **`apps/mcp-worker` `/register`**: Allowlist de `redirect_uri` implementada

### Esta semana — ✅ Concluído

4. ✅ **`apps/web/src/lib/meta-api.ts`**: `validateMetaId()` adicionado e aplicado nos 5 endpoints (campaigns/[id], campaigns, adsets, ads, creatives)
5. ✅ **`apps/web/src/lib/supabase/middleware.ts`**: Fix do open redirect (`//evil.com`)
6. ✅ **`apps/mcp-worker`**: Rate limit por IP aplicado antes do `routeOAuth()`

### Próximo sprint — ✅ Concluído (exceto itens marcados)

7. ⚠️ **Supabase Auth**: Habilitar lockout por conta (`max_failed_attempts`) — requer ação manual no Dashboard ou CAPTCHA no frontend
8. ✅ **Supabase Auth**: `enable_confirmations = true` ativo no `config.toml`
9. ✅ **`apps/web/next.config.ts`**: CSP header adicionado
10. ✅ **`apps/mcp-worker`**: CORS restrito para origens autorizadas em `/register`, `/token`, `/revoke`
11. ⚠️ **`apps/web/src/app/api/internal/`**: IP allowlist pendente — depende de decisão de infra

### Pendente — Ações manuais abertas

Todas as vulnerabilidades foram corrigidas em código. Restam duas tarefas operacionais:

#### 🟠 Aberto 1 — AUTH-VULN-08: Lockout por conta no Supabase

Já existe lockout na rota `/api/auth/login` (5 falhas / 15 min por email), mas recomenda-se ativar também a proteção nativa do Supabase como segunda camada.

**Como configurar (Supabase Dashboard):**

1. Acessar: **Authentication → Attack Protection** (ou **Rate Limits**) no projeto cloud.
2. Habilitar **"CAPTCHA protection"** (hCaptcha ou Turnstile) e configurar o site key / secret key.
3. Em **Rate Limits**, ajustar:
   - `Password-based sign-in attempts per hour`: **10** (padrão é 30)
   - `Sign-up attempts per hour`: **5**
4. Se CAPTCHA for ativado, atualizar os formulários de login/signup para incluir o token do CAPTCHA na chamada `signInWithPassword({ options: { captchaToken } })`.

**Alternativa (sem CAPTCHA):** manter apenas o lockout já implementado em `apps/web/src/app/api/auth/login/route.ts` — que cobre o cenário de rotação de IP, que é o principal risco.

---

#### 🟡 Aberto 2 — IP allowlist para APIs internas

Código já está pronto (`apps/web/src/lib/internal-api-auth.ts`). Falta apenas definir a env var em produção.

**Como configurar:**

1. Descobrir os IPs de saída do MCP Worker (quem chama `/api/internal/meta-token/refresh` e `/api/internal/billing/notify-dunning`):
   - Cloudflare Workers: a saída usa a rede Cloudflare. Há duas opções:
     - **Opção A (mais simples):** usar **Service Bindings** entre Worker e Next.js, eliminando o IP público. Se não for viável, seguir B.
     - **Opção B:** fazer uma chamada de teste do Worker para um endpoint que loga o `CF-Connecting-IP` recebido pelo app Next.js (ex: logar temporariamente em `/api/internal/meta-token/refresh`). Coletar os IPs observados em produção por ~24h.
2. Configurar a env var no ambiente de produção (Vercel / Cloudflare Pages / onde o `apps/web` roda):
   ```
   INTERNAL_API_ALLOWED_IPS=<ip1>,<ip2>,<ip3>
   ```
   Formato: IPs separados por vírgula, sem espaços. Exemplo: `203.0.113.10,203.0.113.11`.
3. Fazer deploy e verificar:
   ```bash
   # De um IP não listado — deve retornar 403
   curl -X POST https://vibefly.app/api/internal/meta-token/refresh \
     -H "x-internal-api-token: $TOKEN"
   # → {"error":"Forbidden"}
   ```
4. Se o provedor usar ranges dinâmicos (comum em Cloudflare Workers), avaliar mudar para **Service Bindings** ou **mTLS** no lugar de IP allowlist.

**Nota:** sem a env var configurada, o código é backward-compatible e apenas valida o token — o mesmo comportamento de antes da mudança.

---

## Artefatos do Pentest

Os deliverables completos com PoCs detalhados estão em:

```
~/.shannon/workspaces/host-docker-internal_shannon-1776996059165/deliverables/
├── comprehensive_security_assessment_report.md  (40KB — relatório consolidado)
├── auth_exploitation_evidence.md                (26KB — PoCs de auth)
├── injection_exploitation_evidence.md           (19KB — PoCs de injection)
├── authz_exploitation_evidence.md               (16KB — PoCs de authz)
├── pre_recon_deliverable.md                     (56KB — análise estática)
└── recon_deliverable.md                         (71KB — mapa de superfície)
```

> **Nota:** Os artefatos contêm credenciais de teste geradas durante o pentest e detalhes de exploração. Não commitar no repositório.
