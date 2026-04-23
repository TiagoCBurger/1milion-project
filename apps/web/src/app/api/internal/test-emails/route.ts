// ============================================================
// POST /api/internal/test-emails
//
// Fires off every transactional template with mock props so the
// recipient can preview the email in their inbox. Intended for
// manual QA.
//
// Access controls (defence in depth):
//   1. `INTERNAL_API_TOKEN` header (shared with other internal routes).
//   2. Disabled in production unless env `ENABLE_TEST_EMAILS=true`.
//      Returns 404 otherwise so scanners don't learn the route exists.
//   3. Recipient must be @vibefly.app OR listed in
//      `TEST_EMAIL_ALLOWLIST` (comma-separated env var).
//
// Usage:
//   curl -X POST https://vibefly.app/api/internal/test-emails \
//     -H "x-internal-api-token: $TOKEN" \
//     -H "Content-Type: application/json" \
//     -d '{"to":"me@vibefly.app"}'
//
//   # Only a subset:
//   curl ... -d '{"to":"me@vibefly.app","only":["welcome","billing-receipt"]}'
// ============================================================

import {
  sendTransactionalEmail,
  WelcomeEmail,
  WorkspaceInviteEmail,
  BillingReceiptEmail,
  BillingFailedEmail,
  PlanChangedEmail,
  PlanCancelingEmail,
  MetaConnectedEmail,
  MetaDisconnectedEmail,
  UsageLimitWarningEmail,
} from "@vibefly/email";

const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

// Defence-in-depth on top of the token: restrict both the environment
// this runs in AND which addresses it can email. Even if the token leaks
// the blast radius is limited to preview/dev and to a small allowlist.
const PROD_OVERRIDE = process.env.ENABLE_TEST_EMAILS === "true";
// @vibefly.app addresses are always allowed. Add extras (comma-separated)
// via env `TEST_EMAIL_ALLOWLIST=ticburger@gmail.com,foo@bar.com`.
const ALWAYS_ALLOWED_DOMAIN = "@vibefly.app";
const EXTRA_ALLOWLIST = (process.env.TEST_EMAIL_ALLOWLIST ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0);

function isRecipientAllowed(email: string): boolean {
  const normalized = email.toLowerCase();
  if (normalized.endsWith(ALWAYS_ALLOWED_DOMAIN)) return true;
  if (EXTRA_ALLOWLIST.includes(normalized)) return true;
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// One entry per template. Each dispatch is wrapped in its own try/catch
// so a single failure doesn't abort the rest — useful when debugging a
// broken template in isolation.
const DISPATCHERS: Array<{
  name: string;
  run: (to: string) => Promise<{ id: string }>;
}> = [
  {
    name: "welcome",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Bem-vindo ao VibeFly",
        template: WelcomeEmail,
        props: {
          userName: "Tiago",
          dashboardUrl: "https://app.vibefly.app/dashboard",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "workspace-invite",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Você foi convidado para um workspace",
        template: WorkspaceInviteEmail,
        props: {
          inviterName: "Fulano da Silva",
          workspaceName: "Agência Exemplo",
          inviteUrl: "https://app.vibefly.app/invite/abc123",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "billing-receipt",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Pagamento confirmado — VibeFly Pro",
        template: BillingReceiptEmail,
        props: {
          userName: "Tiago",
          tierName: "Pro",
          amount: "R$ 49,90",
          cycle: "mensal",
          date: new Date().toLocaleDateString("pt-BR"),
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "billing-failed",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Problema no pagamento — VibeFly",
        template: BillingFailedEmail,
        props: {
          userName: "Tiago",
          tierName: "Pro",
          billingUrl: "https://app.vibefly.app/dashboard/billing",
          gracePeriodEnd: new Date(Date.now() + 7 * 86400_000).toLocaleDateString(
            "pt-BR",
          ),
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "plan-changed",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Seu plano foi atualizado",
        template: PlanChangedEmail,
        props: {
          userName: "Tiago",
          oldTier: "Pro",
          newTier: "Max",
          dashboardUrl: "https://app.vibefly.app/dashboard",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "plan-canceling",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Cancelamento confirmado — VibeFly",
        template: PlanCancelingEmail,
        props: {
          userName: "Tiago",
          tierName: "Pro",
          endDate: new Date(Date.now() + 7 * 86400_000).toLocaleDateString(
            "pt-BR",
          ),
          billingUrl: "https://app.vibefly.app/dashboard/billing",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "meta-connected",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Meta conectada com sucesso",
        template: MetaConnectedEmail,
        props: {
          userName: "Tiago",
          businessName: "Minha Empresa",
          accountCount: 3,
          dashboardUrl: "https://app.vibefly.app/dashboard",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "meta-disconnected",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Conexão com Meta perdida",
        template: MetaDisconnectedEmail,
        props: {
          userName: "Tiago",
          workspaceName: "Agência Exemplo",
          reconnectUrl: "https://app.vibefly.app/dashboard/integrations",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
  {
    name: "usage-limit-warning",
    run: (to) =>
      sendTransactionalEmail({
        to,
        subject: "[PREVIEW] Atenção: limite de uso próximo",
        template: UsageLimitWarningEmail,
        props: {
          userName: "Tiago",
          currentUsage: 180,
          limit: 200,
          resource: "requisições por hora",
          upgradeUrl: "https://app.vibefly.app/dashboard/billing",
        },
        tags: [{ name: "category", value: "preview" }],
      }),
  },
];

export async function POST(request: Request) {
  // Production gate: disabled unless explicitly opted-in. Returns 404 to
  // hide the endpoint's existence from scanners.
  if (process.env.NODE_ENV === "production" && !PROD_OVERRIDE) {
    return new Response("Not found", { status: 404 });
  }

  if (!INTERNAL_API_TOKEN || INTERNAL_API_TOKEN.length < 32) {
    return Response.json({ error: "Service not configured" }, { status: 503 });
  }
  const provided = request.headers.get("x-internal-api-token");
  if (!provided || !timingSafeEqual(provided, INTERNAL_API_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to =
    typeof (body as { to?: unknown })?.to === "string"
      ? ((body as { to: string }).to)
      : null;
  if (!to || !to.includes("@")) {
    return Response.json({ error: "Missing or invalid 'to' field" }, { status: 400 });
  }
  if (!isRecipientAllowed(to)) {
    return Response.json(
      {
        error:
          "Recipient not in allowlist. Use an @vibefly.app address or set TEST_EMAIL_ALLOWLIST.",
      },
      { status: 403 },
    );
  }

  // Optional filter: { only: ["welcome","billing-receipt", ...] }.
  // Useful for re-sending just the ones that failed on the previous run.
  const onlyRaw = (body as { only?: unknown })?.only;
  const onlyFilter: Set<string> | null =
    Array.isArray(onlyRaw) && onlyRaw.every((x) => typeof x === "string")
      ? new Set(onlyRaw as string[])
      : null;

  const dispatchers = onlyFilter
    ? DISPATCHERS.filter((d) => onlyFilter.has(d.name))
    : DISPATCHERS;

  const results: Array<{ name: string; ok: boolean; id?: string; error?: string }> = [];
  for (let i = 0; i < dispatchers.length; i++) {
    const disp = dispatchers[i];
    try {
      const { id } = await disp.run(to);
      results.push({ name: disp.name, ok: true, id });
    } catch (err) {
      results.push({
        name: disp.name,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Resend caps at 5 req/s. 250 ms between sends keeps us comfortably below.
    if (i < dispatchers.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const sent = results.filter((r) => r.ok).length;
  return Response.json({
    to,
    total: dispatchers.length,
    sent,
    failures: dispatchers.length - sent,
    results,
  });
}
