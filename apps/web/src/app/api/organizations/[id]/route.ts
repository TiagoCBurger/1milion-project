import { createClient } from "@/lib/supabase/server";
import { recordAudit, extractRequestMeta } from "@/lib/audit";
import { diffObjects } from "@vibefly/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/organizations/[id]
 * Update the organization's name or slug. Owners/admins only.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", id)
    .in("role", ["owner", "admin"])
    .single();
  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return Response.json({ error: "name cannot be empty" }, { status: 400 });
    }
    update.name = name;
  }
  if (body.slug !== undefined) {
    const slug = body.slug.trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return Response.json(
        { error: "slug must contain only lowercase letters, numbers, and dashes" },
        { status: 400 },
      );
    }
    update.slug = slug;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("organizations")
    .update(update)
    .eq("id", id)
    .select("id, name, slug, meta_business_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "Já existe uma organização com este slug." },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    orgId: id,
    actor: { type: "user", userId: user.id },
    action: "organization.update",
    resource: { type: "organization", id },
    before,
    after: data,
    diff: diffObjects(before, data),
    request: extractRequestMeta(request),
  });

  return Response.json(data);
}

/**
 * DELETE /api/organizations/[id]
 * Deletes the organization. Owners only. Cascade removes memberships,
 * projects, subscriptions, meta_tokens, ad_accounts, etc.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", id)
    .eq("role", "owner")
    .single();
  if (!membership) {
    return Response.json(
      { error: "Only the owner can delete the organization." },
      { status: 403 },
    );
  }

  const { data: before } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("organizations").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    orgId: id,
    actor: { type: "user", userId: user.id },
    action: "organization.delete",
    resource: { type: "organization", id },
    before,
    request: extractRequestMeta(request),
  });

  return Response.json({ success: true });
}
