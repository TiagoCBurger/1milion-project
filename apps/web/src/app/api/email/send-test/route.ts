// ============================================================
// Send Test Email — verify Resend integration
// POST /api/email/send-test
// ============================================================

import { createServerClient } from "@/lib/supabase/server";
import { sendTransactionalEmail, WelcomeEmail, EMAIL_TAGS } from "@vibefly/email";

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json() as { to?: string };
  const to = body.to ?? user.email;

  if (!to) {
    return Response.json({ error: "Missing recipient email" }, { status: 400 });
  }

  try {
    const { id } = await sendTransactionalEmail({
      to,
      subject: "[Teste] Email de Boas-vindas — VibeFly",
      template: WelcomeEmail,
      props: {
        userName: user.user_metadata?.display_name ?? to.split("@")[0],
        dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.vibefly.app"}/dashboard`,
      },
      tags: [{ name: "category", value: EMAIL_TAGS.WELCOME }],
    });

    return Response.json({ ok: true, emailId: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
