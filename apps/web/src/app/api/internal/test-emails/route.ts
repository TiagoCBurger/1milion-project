// ============================================================
// POST /api/internal/test-emails
//
// Fires off every transactional template with mock props so the
// recipient can preview the email in their inbox. Intended for
// manual QA — auth'd with the same INTERNAL_API_TOKEN used by
// the other internal endpoints.
//
// Usage:
//   curl -X POST https://vibefly.app/api/internal/test-emails \
//     -H "x-internal-api-token: $TOKEN" \
//     -H "Content-Type: application/json" \
//     -d '{"to":"ticburger@gmail.com"}'
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

  const results: Array<{ name: string; ok: boolean; id?: string; error?: string }> = [];
  for (const disp of DISPATCHERS) {
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
  }

  const sent = results.filter((r) => r.ok).length;
  return Response.json({
    to,
    total: DISPATCHERS.length,
    sent,
    failures: DISPATCHERS.length - sent,
    results,
  });
}
