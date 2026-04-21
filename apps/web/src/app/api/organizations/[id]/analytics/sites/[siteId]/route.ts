import { createClient } from "@/lib/supabase/server";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

interface PatchBody {
  pixel_id?: string | null;
  capi_access_token?: string | null;
  is_active?: boolean;
}

async function authorizeWrite(organizationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!membership) return { error: "Not a member" as const, status: 403 as const };
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Insufficient role" as const, status: 403 as const };
  }
  return { ok: true as const };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id, siteId } = await params;
  const auth = await authorizeWrite(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as PatchBody | null;
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const analytics = createAnalyticsAdminClient();

  // Confirm `siteId` really belongs to `id` before any write. The RPC
  // below is SECURITY DEFINER and filters only on `id = p_site_id`, so
  // an admin of Org A could otherwise overwrite Org B's CAPI token.
  const { data: owning, error: ownErr } = await analytics
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("organization_id", id)
    .maybeSingle();
  if (ownErr) return Response.json({ error: ownErr.message }, { status: 500 });
  if (!owning) return Response.json({ error: "Site not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.pixel_id !== undefined) update.pixel_id = body.pixel_id || null;
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active);

  // Clear token via direct UPDATE (RPC only sets a value).
  if (body.capi_access_token === null || body.capi_access_token === "") {
    update.capi_encrypted_token = null;
  }

  if (Object.keys(update).length > 0) {
    const { error: updateErr } = await analytics
      .from("sites")
      .update(update)
      .eq("id", siteId)
      .eq("organization_id", id);
    if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });
  }

  // Set token via RPC (encrypts server-side using pgp_sym_encrypt).
  if (body.capi_access_token && body.capi_access_token.length > 0) {
    const key = process.env.CAPI_ENCRYPTION_KEY;
    if (!key) return Response.json({ error: "CAPI_ENCRYPTION_KEY not configured" }, { status: 500 });
    const { error: rpcErr } = await analytics.rpc("encrypt_capi_token", {
      p_site_id: siteId,
      p_token: body.capi_access_token,
      p_encryption_key: key,
    });
    if (rpcErr) return Response.json({ error: rpcErr.message }, { status: 500 });
  }

  const { data, error } = await analytics
    .from("sites")
    .select("id, organization_id, domain, public_key, pixel_id, is_active, created_at")
    .eq("id", siteId)
    .eq("organization_id", id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ site: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; siteId: string }> },
) {
  const { id, siteId } = await params;
  const auth = await authorizeWrite(id);
  if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });

  const analytics = createAnalyticsAdminClient();
  const { error } = await analytics
    .from("sites")
    .delete()
    .eq("id", siteId)
    .eq("organization_id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
