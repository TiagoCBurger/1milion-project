import { createClient } from "@/lib/supabase/server";
import { recordAudit, extractRequestMeta } from "@/lib/audit";
import { diffObjects } from "@vibefly/audit";

/**
 * PATCH /api/organizations/[id]/oauth-connections/[connectionId]
 * Updates allowed_projects (new) or is_active for a connection.
 *
 * The older allowed_accounts payload is rejected so clients are forced to
 * migrate to project scoping instead of silently no-oping.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: organizationId, connectionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = (await request.json()) as {
    allowed_projects?: string[];
    allowed_accounts?: unknown;
    is_active?: boolean;
  };

  if (body.allowed_accounts !== undefined) {
    return Response.json(
      {
        error:
          "allowed_accounts is no longer accepted. Use allowed_projects with the project IDs this connection should access.",
      },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {};

  if (body.allowed_projects !== undefined) {
    if (body.allowed_projects.length > 0) {
      const { data: validProjects, error: projErr } = await supabase
        .from("projects")
        .select("id")
        .eq("organization_id", organizationId)
        .in("id", body.allowed_projects);

      if (projErr) {
        return Response.json({ error: projErr.message }, { status: 500 });
      }

      const validIds = new Set((validProjects ?? []).map((p) => p.id));
      for (const id of body.allowed_projects) {
        if (!validIds.has(id)) {
          return Response.json(
            {
              error:
                "Each project in allowed_projects must belong to this organization.",
            },
            { status: 400 }
          );
        }
      }
    }
    update.allowed_projects = body.allowed_projects;
  }

  if (body.is_active !== undefined) {
    update.is_active = body.is_active;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: before } = await supabase
    .from("oauth_connections")
    .select("id, allowed_projects, is_active")
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .single();

  const { data, error } = await supabase
    .from("oauth_connections")
    .update(update)
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .select("id, allowed_projects, is_active")
    .single();

  if (error || !data) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  await recordAudit({
    orgId: organizationId,
    actor: { type: "user", userId: user.id },
    action: "oauth_connection.update",
    resource: { type: "oauth_connection", id: connectionId },
    before,
    after: data,
    diff: diffObjects(before, data),
    request: extractRequestMeta(request),
  });

  return Response.json(data);
}

/**
 * DELETE /api/organizations/[id]/oauth-connections/[connectionId]
 * Revokes a connection (sets is_active = false).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: organizationId, connectionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: before } = await supabase
    .from("oauth_connections")
    .select("id, client_id, allowed_projects, is_active")
    .eq("id", connectionId)
    .eq("organization_id", organizationId)
    .single();

  const { error } = await supabase
    .from("oauth_connections")
    .update({ is_active: false })
    .eq("id", connectionId)
    .eq("organization_id", organizationId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    orgId: organizationId,
    actor: { type: "user", userId: user.id },
    action: "oauth_connection.revoke",
    resource: { type: "oauth_connection", id: connectionId },
    before,
    request: extractRequestMeta(request),
  });

  return Response.json({ success: true });
}
