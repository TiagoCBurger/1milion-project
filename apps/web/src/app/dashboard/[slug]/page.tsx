import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch workspace with membership check (RLS enforced)
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!workspace) notFound();

  // Fetch token status
  const { data: token } = await supabase
    .from("meta_tokens")
    .select("id, token_type, meta_user_id, scopes, expires_at, is_valid, last_validated_at")
    .eq("workspace_id", workspace.id)
    .single();

  // Fetch API keys
  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, is_active, last_used_at, created_at")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true);

  const isConnected = token?.is_valid === true;
  const daysUntilExpiry = token?.expires_at
    ? Math.ceil((new Date(token.expires_at).getTime() - Date.now()) / 86_400_000)
    : null;

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Workspaces
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{workspace.name}</h1>
        {workspace.meta_business_name && (
          <p className="text-sm text-gray-500">
            BM: {workspace.meta_business_name} ({workspace.meta_business_id})
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Connection Status */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">Meta Connection</h3>
          {isConnected ? (
            <>
              <p className="mt-2 text-lg font-semibold text-green-600">Connected</p>
              {daysUntilExpiry !== null && daysUntilExpiry <= 15 && (
                <p className="mt-1 text-sm text-amber-600">
                  Token expires in {daysUntilExpiry} days
                </p>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold text-amber-600">Not Connected</p>
              <Link
                href={`/dashboard/${slug}/connect`}
                className="mt-3 inline-block rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition"
              >
                Connect Token
              </Link>
            </>
          )}
        </div>

        {/* API Keys */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">API Keys</h3>
          <p className="mt-2 text-lg font-semibold">{apiKeys?.length ?? 0} active</p>
          <Link
            href={`/dashboard/${slug}/api-keys`}
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Manage keys
          </Link>
        </div>

        {/* Setup Guide */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">Setup</h3>
          <p className="mt-2 text-sm text-gray-600">Configure your AI tool</p>
          <Link
            href={`/dashboard/${slug}/setup`}
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            View setup guide
          </Link>
        </div>
      </div>
    </div>
  );
}
