"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";

export default function ConnectPage() {
  const { slug } = useParams<{ slug: string }>();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    meta_user_name: string;
    meta_business_name: string;
    expires_at: string | null;
    api_key?: string;
  } | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadWorkspace() {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .single();
      if (data) setWorkspaceId(data.id);
    }
    loadWorkspace();
  }, [slug, supabase]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to connect");
        return;
      }

      setSuccess(data);
      setToken("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Connect Meta Account</h1>
      <p className="text-sm text-gray-600 mb-6">
        Paste your Meta access token from your Developer App.
      </p>

      {/* Instructions */}
      <div className="rounded-lg border bg-gray-50 p-4 mb-6">
        <h3 className="font-medium text-sm mb-2">How to get your token:</h3>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Go to <strong>developers.facebook.com</strong> &rarr; Your App (linked to your BM)</li>
          <li>Go to <strong>Tools</strong> &rarr; <strong>Graph API Explorer</strong></li>
          <li>Select permissions: <code className="bg-gray-200 px-1 rounded">ads_management</code>, <code className="bg-gray-200 px-1 rounded">ads_read</code>, <code className="bg-gray-200 px-1 rounded">business_management</code></li>
          <li>Click <strong>Generate Access Token</strong></li>
          <li>For longer expiry, exchange for a <strong>long-lived token</strong> (60 days)</li>
          <li>Paste the token below</li>
        </ol>
      </div>

      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <h3 className="font-medium text-green-800">Connected successfully!</h3>
          <p className="mt-1 text-sm text-green-700">
            User: {success.meta_user_name}
            <br />
            BM: {success.meta_business_name}
            {success.expires_at && (
              <>
                <br />
                Expires: {new Date(success.expires_at).toLocaleDateString()}
              </>
            )}
          </p>
          {success.api_key && (
            <div className="mt-3 rounded bg-white p-3 border">
              <p className="text-xs text-gray-500 mb-1">Your API key (save it, shown only once):</p>
              <code className="text-sm font-mono break-all select-all">{success.api_key}</code>
            </div>
          )}
          <button
            onClick={() => router.push(`/dashboard/${slug}`)}
            className="mt-4 rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 transition"
          >
            Go to workspace
          </button>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Access Token</label>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="EAAxxxxxxx..."
            />
          </div>
          <button
            type="submit"
            disabled={loading || !workspaceId}
            className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "Validating..." : "Connect Token"}
          </button>
        </form>
      )}
    </div>
  );
}
