// ============================================================
// billing-dunning — Supabase Edge Function
// ------------------------------------------------------------
// Called every 10 minutes by pg_cron (see migration 046). Sends
// `BillingFailedEmail` for any organization whose subscription is
// currently in a `past_due` + grace window and hasn't been notified
// in the last N hours.
//
// Flow:
//   1. Auth: caller must present the project service_role JWT in the
//      `Authorization` header — pg_cron uses vault to sign the request.
//   2. RPC `list_orgs_needing_dunning_email(24)` → ids that still need
//      a reminder. Already-notified orgs (within 24h) are skipped.
//   3. RPC `list_dunning_candidates(ids, 24)` → resolves owner email,
//      tier, grace_period_end for each.
//   4. POST Resend's /emails API with inline HTML per org.
//   5. RPC `mark_dunning_notified(org)` so the next cron tick skips it.
//
// Design notes:
//   - Inlined HTML (instead of importing @vibefly/email) to keep the
//     Edge Function self-contained; the React-Email templates use Node
//     APIs that don't port cleanly to Deno, and this one template is
//     simple enough to replicate here. Keep it in sync if the canonical
//     template changes.
//   - Failure of one org's email does NOT block the rest — we return a
//     per-org summary. Next tick will retry (see list_orgs_... filter).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const REMIND_AFTER_HOURS = 24;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "VibeFly <noreply@vibefly.app>";
const EMAIL_REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? "ola@vibefly.app";
const BILLING_URL =
  Deno.env.get("BILLING_URL") ?? "https://app.vibefly.app/dashboard/billing";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function verifyAuth(req: Request): boolean {
  const header = req.headers.get("Authorization");
  const token = header?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  return timingSafeEqual(token, SUPABASE_SERVICE_ROLE_KEY);
}

interface Candidate {
  organization_id: string;
  organization_name: string | null;
  owner_email: string | null;
  owner_name: string | null;
  tier: "pro" | "max" | "enterprise";
  grace_period_end: string | null;
  already_notified: boolean;
}

function renderBillingFailedHtml(params: {
  userName: string;
  tierName: string;
  gracePeriodEnd?: string;
}): string {
  const { userName, tierName, gracePeriodEnd } = params;
  const graceParagraph = gracePeriodEnd
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">
         Seu acesso ${tierName} continua liberado at&eacute; <strong>${gracePeriodEnd}</strong>.
         Depois dessa data a conta volta automaticamente para o plano gratuito.
       </p>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Problema no pagamento — VibeFly</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f9fafb;font-family:Inter,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">
      Problema no pagamento do VibeFly
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0"
                 style="background:#ffffff;border-radius:12px;padding:32px;max-width:560px;">
            <tr>
              <td>
                <h1 style="margin:0 0 24px;font-size:24px;font-weight:600;color:#111827;">
                  Problema no pagamento
                </h1>
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">
                  Fala, ${userName}. N&atilde;o conseguimos processar o pagamento do seu plano
                  VibeFly ${tierName}.
                </p>
                <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">
                  Isso pode acontecer por cart&atilde;o expirado, limite insuficiente ou bloqueio
                  do banco. Atualize seus dados de pagamento para manter seu plano ativo.
                </p>
                ${graceParagraph}
                <p style="margin:24px 0;">
                  <a href="${BILLING_URL}"
                     style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;
                            padding:12px 24px;border-radius:8px;font-weight:600;">
                    Atualizar pagamento
                  </a>
                </p>
                <p style="margin:0;font-size:14px;line-height:20px;color:#6b7280;">
                  Se o problema persistir, responda este email que a gente resolve junto.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

interface ResendSendResult {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
}

async function sendDunningEmail(candidate: Candidate): Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}> {
  if (!candidate.owner_email) {
    return { ok: false, error: "owner_email missing" };
  }
  const tierLabel =
    candidate.tier.charAt(0).toUpperCase() + candidate.tier.slice(1);
  const gracePeriodEnd = candidate.grace_period_end
    ? new Date(candidate.grace_period_end).toLocaleDateString("pt-BR")
    : undefined;

  const html = renderBillingFailedHtml({
    userName:
      candidate.owner_name ?? candidate.owner_email.split("@")[0] ?? "Usuário",
    tierName: tierLabel,
    gracePeriodEnd,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [candidate.owner_email],
      reply_to: EMAIL_REPLY_TO,
      subject: "Problema no pagamento — VibeFly",
      html,
      tags: [{ name: "category", value: "billing" }],
    }),
  });

  const body = (await res.json().catch(() => ({}))) as ResendSendResult;
  if (!res.ok) {
    return {
      ok: false,
      error: body.message ?? body.name ?? `HTTP ${res.status}`,
    };
  }
  return { ok: true, messageId: body.id };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!verifyAuth(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: pending, error: pendingErr } = await admin.rpc(
    "list_orgs_needing_dunning_email",
    { p_remind_after_hours: REMIND_AFTER_HOURS },
  );
  if (pendingErr) {
    return Response.json({ error: pendingErr.message }, { status: 500 });
  }

  const ids = (pending as Array<{ organization_id: string }> | null)
    ?.map((r) => r.organization_id)
    .filter((v): v is string => typeof v === "string") ?? [];

  if (ids.length === 0) {
    return Response.json({ processed: 0, sent: 0 });
  }

  const { data: candidates, error: candErr } = await admin.rpc(
    "list_dunning_candidates",
    {
      p_organization_ids: ids,
      p_remind_after_hours: REMIND_AFTER_HOURS,
    },
  );
  if (candErr) {
    return Response.json({ error: candErr.message }, { status: 500 });
  }

  const rows = (candidates ?? []) as Candidate[];
  const results: Array<{
    organization_id: string;
    ok: boolean;
    reason?: string;
  }> = [];

  for (const cand of rows) {
    if (cand.already_notified) {
      results.push({
        organization_id: cand.organization_id,
        ok: true,
        reason: "already_notified",
      });
      continue;
    }
    const send = await sendDunningEmail(cand);
    if (!send.ok) {
      results.push({
        organization_id: cand.organization_id,
        ok: false,
        reason: send.error,
      });
      continue;
    }
    const { error: markErr } = await admin.rpc("mark_dunning_notified", {
      p_organization_id: cand.organization_id,
    });
    if (markErr) {
      console.error(
        "[billing-dunning] mark_dunning_notified failed:",
        cand.organization_id,
        markErr,
      );
    }
    results.push({ organization_id: cand.organization_id, ok: true });
  }

  const sent = results.filter((r) => r.ok && r.reason !== "already_notified").length;
  const skipped = results.filter((r) => r.reason === "already_notified").length;
  return Response.json({
    processed: rows.length,
    sent,
    skipped,
    failures: results.filter((r) => !r.ok).length,
    items: results,
  });
});
