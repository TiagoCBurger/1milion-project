// ============================================================
// Public Unsubscribe Endpoint
// GET /api/email/unsubscribe?email=x&t=token
//
// `t` must be a valid HMAC over `email` produced with
// EMAIL_UNSUBSCRIBE_SECRET. Without it, the request is rejected
// so an attacker cannot mass-unsubscribe arbitrary addresses.
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@vibefly/email";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";

function errorPage(message: string, status: number): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Link inválido — VibeFly</title></head>
<body style="font-family:Inter,sans-serif;text-align:center;padding:80px 20px;color:#334155">
  <h1 style="color:#7C3AED">Link inválido ou expirado</h1>
  <p>${message}</p>
  <p><a href="https://app.vibefly.app" style="color:#7C3AED">Voltar ao VibeFly</a></p>
</body>
</html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("t");

  if (!email || !token) {
    return errorPage(
      "Faltam parâmetros no link. Use o botão de descadastro direto do email recebido.",
      400,
    );
  }

  if (!verifyUnsubscribeToken(email, token)) {
    return errorPage(
      "Não conseguimos validar esse link. Se o problema continuar, entre em contato com o suporte.",
      403,
    );
  }

  const admin = createAdminClient();

  // Find the user by email
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profile) {
    // Mark as unsubscribed in our DB
    await admin
      .from("email_preferences")
      .upsert(
        {
          user_id: profile.id,
          marketing_opted_in: false,
          product_updates: false,
          tips_and_tricks: false,
          unsubscribed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  // Also mark in Resend audience
  const audienceId = process.env.RESEND_AUDIENCE_ALL_USERS;
  if (audienceId) {
    try {
      const resend = getResendClient();
      const { data: contacts } = await resend.contacts.list({ audienceId });
      const contact = contacts?.data?.find((c) => c.email === email);
      if (contact) {
        await resend.contacts.update({
          audienceId,
          id: contact.id,
          unsubscribed: true,
        });
      }
    } catch {
      // Non-critical
    }
  }

  return new Response(
    `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Descadastrado — VibeFly</title></head>
<body style="font-family:Inter,sans-serif;text-align:center;padding:80px 20px;color:#334155">
  <h1 style="color:#7C3AED">Descadastro confirmado</h1>
  <p>Você não receberá mais emails de marketing do VibeFly.</p>
  <p><a href="https://app.vibefly.app" style="color:#7C3AED">Voltar ao VibeFly</a></p>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}
