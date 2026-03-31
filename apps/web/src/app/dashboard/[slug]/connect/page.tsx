"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function ConnectPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualSuccess, setManualSuccess] = useState<{
    meta_user_name: string;
    meta_business_name: string;
    expires_at: string | null;
    api_key?: string;
  } | null>(null);

  // OAuth redirect results
  const oauthSuccess = searchParams.get("success") === "true";
  const oauthName = searchParams.get("name");
  const oauthApiKey = searchParams.get("api_key");
  const oauthError = searchParams.get("error");

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

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    denied: "You denied the permissions request. Please try again and accept the required permissions.",
    invalid_state: "The connection request expired or was invalid. Please try again.",
    unauthorized: "You need to be logged in to connect your account.",
    store_failed: "Failed to store the token. Please try again.",
    exchange_failed: "Failed to complete the Facebook connection. Please try again.",
  };

  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    setManualSuccess(null);

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

      setManualSuccess(data);
      setToken("");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleFacebookConnect() {
    if (!workspaceId) return;
    window.location.href = `/api/auth/facebook?workspace_id=${workspaceId}&slug=${slug}`;
  }

  // Show success state (from OAuth or manual)
  const successData = oauthSuccess
    ? { meta_user_name: oauthName || "Unknown", api_key: oauthApiKey || undefined }
    : manualSuccess;

  if (successData) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-bold mb-2">Connect Meta Account</h1>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mt-6">
          <h3 className="font-medium text-green-800">Connected successfully!</h3>
          <p className="mt-1 text-sm text-green-700">
            User: {successData.meta_user_name}
            {"meta_business_name" in successData && (
              <>
                <br />
                BM: {(successData as typeof manualSuccess)?.meta_business_name}
              </>
            )}
            {"expires_at" in successData &&
              (successData as typeof manualSuccess)?.expires_at && (
                <>
                  <br />
                  Expires:{" "}
                  {new Date(
                    (successData as typeof manualSuccess)!.expires_at!
                  ).toLocaleDateString()}
                </>
              )}
          </p>
          {successData.api_key && (
            <div className="mt-3 rounded bg-white p-3 border">
              <p className="text-xs text-gray-500 mb-1">
                Your API key (save it, shown only once):
              </p>
              <code className="text-sm font-mono break-all select-all">
                {successData.api_key}
              </code>
            </div>
          )}
          <button
            onClick={() => router.push(`/dashboard/${slug}`)}
            className="mt-4 rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 transition"
          >
            Go to workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-2">Connect Meta Account</h1>
      <p className="text-sm text-gray-600 mb-6">
        Connect your Facebook account to authorize access to your Meta Ads data.
      </p>

      {/* Error from OAuth redirect or manual */}
      {(oauthError || error) && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 mb-6">
          {oauthError ? errorMessages[oauthError] || "An error occurred. Please try again." : error}
        </div>
      )}

      {/* Primary: Facebook OAuth Button */}
      <button
        onClick={handleFacebookConnect}
        disabled={!workspaceId}
        className="w-full flex items-center justify-center gap-3 rounded-lg px-6 py-3 text-white font-medium text-base transition disabled:opacity-50 hover:opacity-90"
        style={{ backgroundColor: "#1877F2" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        Connect with Facebook
      </button>

      <p className="text-xs text-gray-500 mt-2 text-center">
        We&apos;ll request access to manage your ads, read insights, and access your Business
        Manager.
      </p>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-gray-400">or</span>
        </div>
      </div>

      {/* Secondary: Manual Token (collapsible) */}
      <button
        onClick={() => setShowManual(!showManual)}
        className="w-full text-left text-sm text-gray-500 hover:text-gray-700 transition flex items-center gap-2"
      >
        <svg
          className={`w-4 h-4 transition-transform ${showManual ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Advanced: Paste Token Manually
      </button>

      {showManual && (
        <div className="mt-4 rounded-lg border bg-gray-50 p-4">
          <p className="text-xs text-gray-500 mb-3">
            Use this if you have a system user token or need to paste a token from the Graph API
            Explorer.
          </p>
          <form onSubmit={handleManualConnect} className="space-y-3">
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
              className="rounded-md bg-gray-700 px-4 py-2 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
            >
              {loading ? "Validating..." : "Connect Token"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
