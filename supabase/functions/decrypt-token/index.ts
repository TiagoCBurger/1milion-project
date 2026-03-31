import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
const WORKER_SECRET = Deno.env.get("WORKER_SECRET");

Deno.serve(async (req) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify caller auth (accepts service_role JWT, sb_secret key, or worker secret)
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validTokens = [SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET].filter(Boolean);
  if (!token || !validTokens.includes(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceId } = await req.json();
  if (!workspaceId) {
    return Response.json({ error: "workspaceId required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc("decrypt_meta_token", {
    p_workspace_id: workspaceId,
    p_encryption_key: TOKEN_ENCRYPTION_KEY,
  });

  if (error) {
    console.error("decrypt error:", error.message);
    return Response.json({ error: "Failed to decrypt token" }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "No valid token found for workspace" },
      { status: 404 }
    );
  }

  return Response.json({ token: data });
});
