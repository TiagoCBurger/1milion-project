"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Check, Copy } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
  const [copied, setCopied] = useState(false);
  const [manualSuccess, setManualSuccess] = useState<{
    meta_user_name: string;
    meta_business_name: string;
    expires_at: string | null;
    api_key?: string;
  } | null>(null);

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

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const successData = oauthSuccess
    ? { meta_user_name: oauthName || "Unknown", api_key: oauthApiKey || undefined }
    : manualSuccess;

  if (successData) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Workspaces", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Connect" },
          ]}
        />
        <div className="p-6 max-w-xl">
          <Card className="bg-emerald-50/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-emerald-800">Connected successfully!</CardTitle>
              </div>
              <CardDescription className="text-emerald-700">
                User: {successData.meta_user_name}
                {"meta_business_name" in successData && (
                  <> &middot; BM: {(successData as typeof manualSuccess)?.meta_business_name}</>
                )}
              </CardDescription>
            </CardHeader>
            {successData.api_key && (
              <CardContent>
                <div className="rounded-lg bg-white p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-muted-foreground font-medium">
                      Your API key (save it, shown only once):
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(successData.api_key!)}
                      className="h-7 px-2"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <code className="text-sm font-mono break-all select-all block">
                    {successData.api_key}
                  </code>
                </div>
                <Button
                  onClick={() => router.push(`/dashboard/${slug}`)}
                  className="mt-4 w-full"
                >
                  Go to workspace
                </Button>
              </CardContent>
            )}
            {!successData.api_key && (
              <CardContent>
                <Button
                  onClick={() => router.push(`/dashboard/${slug}`)}
                  className="w-full"
                >
                  Go to workspace
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Connect" },
        ]}
      />
      <div className="p-6 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Connect Meta Account</h1>
        <p className="text-muted-foreground mb-6">
          Connect your Facebook account to authorize access to your Meta Ads data.
        </p>

        {(oauthError || error) && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive mb-6">
            {oauthError ? errorMessages[oauthError] || "An error occurred. Please try again." : error}
          </div>
        )}

        {/* Facebook OAuth Button */}
        <Button
          onClick={handleFacebookConnect}
          disabled={!workspaceId}
          size="lg"
          className="w-full text-base h-12"
          style={{ backgroundColor: "#1877F2" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="mr-2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Connect with Facebook
        </Button>

        <p className="text-xs text-muted-foreground mt-2 text-center">
          We&apos;ll request access to manage your ads, read insights, and access your Business Manager.
        </p>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/30" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-4 text-muted-foreground">or</span>
          </div>
        </div>

        {/* Manual Token */}
        <button
          onClick={() => setShowManual(!showManual)}
          className="w-full text-left text-sm text-muted-foreground hover:text-foreground transition flex items-center gap-2"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${showManual ? "rotate-90" : ""}`} />
          Advanced: Paste Token Manually
        </button>

        {showManual && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-3">
                Use this if you have a system user token or need to paste a token from the Graph API Explorer.
              </p>
              <form onSubmit={handleManualConnect} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="token">Access Token</Label>
                  <textarea
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    rows={3}
                    className="flex w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:bg-card"
                    placeholder="EAAxxxxxxx..."
                  />
                </div>
                <Button type="submit" disabled={loading || !workspaceId} variant="secondary" className="w-full">
                  {loading ? "Validating..." : "Connect Token"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
