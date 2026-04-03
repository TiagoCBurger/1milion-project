// ============================================================
// User Created Hook — sends welcome email
// Called by a Supabase Database Webhook on INSERT to profiles
//
// Setup in Supabase Dashboard > Database > Webhooks:
//   Table: public.profiles
//   Event: INSERT
//   URL:   https://app.vibefly.app/api/email/hooks/user-created
//   HTTP Method: POST
//   Headers:
//     Authorization: Bearer <SUPABASE_WEBHOOK_SECRET>
// ============================================================

import {
  sendTransactionalEmail,
  syncUserToAudience,
  WelcomeEmail,
  EMAIL_TAGS,
} from "@vibefly/email";

interface ProfileInsertPayload {
  type: "INSERT";
  table: string;
  record: {
    id: string;
    email: string;
    display_name: string | null;
    created_at: string;
  };
  schema: string;
}

function verifyHookSecret(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const secret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if not configured
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!verifyHookSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json() as ProfileInsertPayload;

  if (payload.type !== "INSERT" || payload.table !== "profiles") {
    return Response.json({ ok: true, skipped: true });
  }

  const { email, display_name } = payload.record;
  const userName = display_name ?? email.split("@")[0];

  // Send welcome email
  await sendTransactionalEmail({
    to: email,
    subject: "Bem-vindo ao VibeFly!",
    template: WelcomeEmail,
    props: {
      userName,
      dashboardUrl: "https://app.vibefly.app/dashboard",
    },
    tags: [{ name: "category", value: EMAIL_TAGS.WELCOME }],
  });

  // Add to "All Users" audience
  const audienceId = process.env.RESEND_AUDIENCE_ALL_USERS;
  if (audienceId) {
    await syncUserToAudience(
      audienceId,
      email,
      userName.split(" ")[0]
    );
  }

  return Response.json({ ok: true });
}
