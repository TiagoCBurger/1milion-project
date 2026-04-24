// ============================================================
// POST /api/internal/billing/notify-dunning
//
// Service-to-service endpoint called by the mcp-worker janitor
// right after `detect_overdue_subscriptions` flags one or more
// organizations as past_due. AbacatePay v2 does not emit a
// payment-failure event (see docs/openapi.yaml enum), so the
// BillingFailedEmail dispatch lives here instead of the webhook.
//
// Auth: `x-internal-api-token` header, constant-time comparison
// against INTERNAL_API_TOKEN. Same pattern as the meta-token
// refresh endpoint.
//
// Behaviour:
//   * Input: { organization_ids: string[] } (max 50 per call)
//   * RPC list_dunning_candidates returns owner email + grace
//     deadline only for orgs still in past_due with an unexpired
//     grace window. Already-notified orgs (within the reminder
//     window) are returned with already_notified=true and skipped.
//   * For each candidate: send BillingFailedEmail, then call
//     mark_dunning_notified so the next tick doesn't re-send.
//   * Never throws on per-org failures — returns per-id result.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendTransactionalEmail,
  BillingFailedEmail,
  EMAIL_TAGS,
} from "@vibefly/email";
import { recordAudit, extractRequestMeta } from "@/lib/audit";
import { validateInternalRequest } from "@/lib/internal-api-auth";

const MAX_BATCH = 50;
const REMIND_AFTER_HOURS = 24;

interface ItemResult {
  organization_id: string;
  ok: boolean;
  reason?: string;
  skipped?: "no_candidate" | "already_notified";
}

export async function POST(request: Request) {
  const rejection = validateInternalRequest(request);
  if (rejection) return rejection;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(
    (body as { organization_ids?: unknown })?.organization_ids,
  )
    ? (body as { organization_ids: unknown[] }).organization_ids
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_BATCH)
    : [];

  if (ids.length === 0) {
    return Response.json(
      { error: "organization_ids must be a non-empty string array" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: candidates, error: candErr } = await admin.rpc(
    "list_dunning_candidates",
    {
      p_organization_ids: ids,
      p_remind_after_hours: REMIND_AFTER_HOURS,
    },
  );
  if (candErr) {
    return Response.json(
      { error: `list_dunning_candidates: ${candErr.message}` },
      { status: 500 },
    );
  }

  type Candidate = {
    organization_id: string;
    organization_name: string | null;
    owner_email: string | null;
    owner_name: string | null;
    tier: "pro" | "max" | "enterprise";
    grace_period_end: string | null;
    already_notified: boolean;
  };

  const candidateRows = (Array.isArray(candidates) ? candidates : []) as Candidate[];
  const byOrgId = new Map<string, Candidate>(
    candidateRows.map((c) => [c.organization_id, c]),
  );

  const results: ItemResult[] = [];

  for (const organizationId of ids) {
    const cand = byOrgId.get(organizationId);
    if (!cand) {
      results.push({
        organization_id: organizationId,
        ok: false,
        skipped: "no_candidate",
        reason:
          "Organization is not in past_due state or owner email not found — ignored.",
      });
      continue;
    }
    if (cand.already_notified) {
      results.push({
        organization_id: organizationId,
        ok: true,
        skipped: "already_notified",
      });
      continue;
    }
    if (!cand.owner_email) {
      results.push({
        organization_id: organizationId,
        ok: false,
        reason: "Owner email missing",
      });
      continue;
    }

    const tierLabel = cand.tier.charAt(0).toUpperCase() + cand.tier.slice(1);
    const gracePeriodEnd = cand.grace_period_end
      ? new Date(cand.grace_period_end).toLocaleDateString("pt-BR")
      : undefined;

    try {
      await sendTransactionalEmail({
        to: cand.owner_email,
        subject: "Problema no pagamento — VibeFly",
        template: BillingFailedEmail,
        props: {
          userName: cand.owner_name ?? cand.owner_email.split("@")[0],
          tierName: tierLabel,
          gracePeriodEnd,
        },
        tags: [{ name: "category", value: EMAIL_TAGS.BILLING }],
      });
    } catch (err) {
      results.push({
        organization_id: organizationId,
        ok: false,
        reason: err instanceof Error ? err.message : "send failed",
      });
      continue;
    }

    const { error: markErr } = await admin.rpc("mark_dunning_notified", {
      p_organization_id: organizationId,
    });
    if (markErr) {
      // Email already went out — surface the error but don't retry, or we
      // risk the next janitor tick re-sending. Log it for manual review.
      console.error(
        "[notify-dunning] mark_dunning_notified failed after send:",
        organizationId,
        markErr,
      );
    }

    results.push({ organization_id: organizationId, ok: true });

    await recordAudit({
      orgId: organizationId,
      actor: { type: "system", identifier: "cron:notify-dunning" },
      action: "billing.dunning_notified",
      resource: { type: "subscription", id: organizationId },
      after: {
        tier: cand.tier,
        grace_period_end: cand.grace_period_end,
        owner_email: cand.owner_email,
      },
      request: extractRequestMeta(request),
    });
  }

  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  return Response.json({
    processed: ids.length,
    sent,
    skipped,
    failures: ids.length - sent - skipped,
    items: results,
  });
}
