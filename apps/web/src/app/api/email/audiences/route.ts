// ============================================================
// Audiences API — platform-admin only.
// GET  /api/email/audiences   — list all audiences
// POST /api/email/audiences   — create an audience
// ============================================================

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { listAudiences, createAudience } from "@vibefly/email";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const audiences = await listAudiences();
  return Response.json({ audiences });
}

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json() as { name: string };
  if (!body.name) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }

  const audience = await createAudience(body.name);
  return Response.json({ audience }, { status: 201 });
}
