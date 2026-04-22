// ============================================================
// Send Test Email — verify Resend integration.
//
// Locked to the caller's own email so it cannot be used as an
// open mailer: the recipient is always `user.email`, no matter
// what the body says.
// POST /api/email/send-test
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { sendTransactionalEmail, WelcomeEmail, EMAIL_TAGS } from "@vibefly/email";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const to = user.email;
  if (!to) {
    return Response.json(
      { error: "Your account has no email address on file" },
      { status: 400 },
    );
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
