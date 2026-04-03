// ============================================================
// Contacts API
// GET    /api/email/audiences/[id]/contacts  — list contacts
// POST   /api/email/audiences/[id]/contacts  — add contact
// DELETE /api/email/audiences/[id]/contacts  — remove contact
// ============================================================

import { createServerClient } from "@/lib/supabase/server";
import { listContacts, addContact, removeContact } from "@vibefly/email";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: audienceId } = await params;
  const contacts = await listContacts(audienceId);
  return Response.json({ contacts });
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: audienceId } = await params;
  const body = await request.json() as { email: string; firstName?: string };

  if (!body.email) {
    return Response.json({ error: "Missing email" }, { status: 400 });
  }

  const contact = await addContact(audienceId, body.email, body.firstName);
  return Response.json({ contact }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: audienceId } = await params;
  const body = await request.json() as { contactId: string };

  if (!body.contactId) {
    return Response.json({ error: "Missing contactId" }, { status: 400 });
  }

  await removeContact(audienceId, body.contactId);
  return Response.json({ ok: true });
}
