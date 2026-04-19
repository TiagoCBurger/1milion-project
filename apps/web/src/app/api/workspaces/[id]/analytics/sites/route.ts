import { createClient } from "@/lib/supabase/server";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function newPublicKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `pk_${hex}`;
}

async function authorizeWrite(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!membership) return { error: "Not a member" as const, status: 403 as const };
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Insufficient role" as const, status: 403 as const };
  }
  return { ok: true as const };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizeWrite(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const analytics = createAnalyticsAdminClient();
  const { data, error } = await analytics
    .from("sites")
    .select("id, workspace_id, name, domain, public_key, pixel_id, is_active, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sites: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await authorizeWrite(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as { name?: string; domain?: string } | null;
  const name = body?.name?.trim();
  const domain = body?.domain?.trim().toLowerCase();
  if (!name) return Response.json({ error: "Nome é obrigatório" }, { status: 400 });
  if (!domain || !DOMAIN_RE.test(domain)) {
    return Response.json({ error: "Domínio inválido" }, { status: 400 });
  }

  const analytics = createAnalyticsAdminClient();
  const { data, error } = await analytics
    .from("sites")
    .insert({ workspace_id: id, name, domain, public_key: newPublicKey(), is_active: true })
    .select("id, workspace_id, name, domain, public_key, pixel_id, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json({ error: "Domínio já cadastrado neste workspace" }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ site: data });
}
