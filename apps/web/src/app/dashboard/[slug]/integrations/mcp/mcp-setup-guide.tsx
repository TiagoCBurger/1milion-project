"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Copy, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const MCP_GATEWAY_URL =
  process.env.NEXT_PUBLIC_MCP_GATEWAY_URL ||
  "https://mcp-worker.ticburger.workers.dev";

/** Claude Code / Claude Desktop (root `.mcp.json`); includes transport hint. */
const OAUTH_MCP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      vibefly: {
        type: "http",
        url: `${MCP_GATEWAY_URL}/mcp`,
      },
    },
  },
  null,
  2
);

/** Cursor reads project MCP from `.cursor/mcp.json` (see cursor.com/docs/mcp). */
const CURSOR_OAUTH_MCP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      vibefly: {
        url: `${MCP_GATEWAY_URL}/mcp`,
      },
    },
  },
  null,
  2
);

export function McpSetupGuide({ slug }: { slug: string }) {
  const [apiKeyPrefix, setApiKeyPrefix] = useState("mads_your_key_here");
  const [copied, setCopied] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadKey() {
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .single();
      if (!ws) return;

      const { data: keys } = await supabase
        .from("api_keys")
        .select("key_prefix")
        .eq("workspace_id", ws.id)
        .eq("is_active", true)
        .limit(1);

      if (keys?.[0]) {
        setApiKeyPrefix(keys[0].key_prefix + "...");
      }
    }
    loadKey();
  }, [slug, supabase]);

  const claudeApiKeyConfig = JSON.stringify(
    {
      mcpServers: {
        [`meta-ads-${slug}`]: {
          type: "http",
          url: `${MCP_GATEWAY_URL}/mcp`,
          headers: {
            Authorization: `Bearer ${apiKeyPrefix}`,
          },
        },
      },
    },
    null,
    2
  );

  const cursorApiKeyConfig = JSON.stringify(
    {
      mcpServers: {
        [`meta-ads-${slug}`]: {
          url: `${MCP_GATEWAY_URL}/mcp`,
          headers: {
            Authorization: `Bearer ${apiKeyPrefix}`,
          },
        },
      },
    },
    null,
    2
  );

  const configs: Record<string, string> = {
    oauth: OAUTH_MCP_CONFIG,
    claude: claudeApiKeyConfig,
    cursor: cursorApiKeyConfig,
    http: `curl -X POST ${MCP_GATEWAY_URL}/mcp \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Authorization: Bearer ${apiKeyPrefix}" \\
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'`,
  };

  async function copyConfig(key: string) {
    await navigator.clipboard.writeText(configs[key]);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Guia de setup</h2>
      <p className="text-muted-foreground mb-6">
        Conecte sua ferramenta de IA ao servidor MCP da VibeFly.
      </p>

      <Tabs defaultValue="oauth">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="oauth">Claude Code (OAuth)</TabsTrigger>
          <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="http">HTTP / Custom</TabsTrigger>
        </TabsList>

        <TabsContent value="oauth">
          <Card>
            <CardContent className="p-0 relative">
              <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                <code>{configs.oauth}</code>
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyConfig("oauth")}
                className="absolute top-3 right-3"
              >
                {copied === "oauth" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied === "oauth" ? "Copied" : "Copy"}
              </Button>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Claude Code:</strong> save as{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.mcp.json</code> at the
            project root (or use the CLI below).{" "}
            <strong className="font-medium text-foreground">Cursor:</strong> save as{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.cursor/mcp.json</code>{" "}
            — Cursor does not read root <code className="bg-muted px-1 rounded text-xs font-mono">.mcp.json</code>.
            Use the Cursor-specific JSON (no API key):{" "}
          </p>
          <Card className="mt-3">
            <CardContent className="p-0 relative">
              <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                <code>{CURSOR_OAUTH_MCP_CONFIG}</code>
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(CURSOR_OAUTH_MCP_CONFIG);
                  setCopied("cursor-oauth");
                  setTimeout(() => setCopied(null), 2000);
                }}
                className="absolute top-3 right-3"
              >
                {copied === "cursor-oauth" ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copied === "cursor-oauth" ? "Copied" : "Copy for Cursor"}
              </Button>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            No API key needed — your app will open a browser on first connection so you can log in and
            select your workspace. Quit and reopen Cursor after editing{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.cursor/mcp.json</code>.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Or add via CLI:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono break-all">
              claude mcp add --scope project vibefly --transport http &quot;{MCP_GATEWAY_URL}/mcp&quot;
            </code>
          </p>
        </TabsContent>

        {(["claude", "http"] as const).map((tabId) => (
          <TabsContent key={tabId} value={tabId}>
            <Card>
              <CardContent className="p-0 relative">
                <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                  <code>{configs[tabId]}</code>
                </pre>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyConfig(tabId)}
                  className="absolute top-3 right-3"
                >
                  {copied === tabId ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copied === tabId ? "Copied" : "Copy"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
        <TabsContent value="cursor">
          <p className="text-sm text-muted-foreground mb-3">
            Create{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.cursor/mcp.json</code> in
            your project (folder <code className="bg-muted px-1 rounded text-xs font-mono">.cursor</code> at
            the repo root), paste the JSON below, then fully quit and reopen Cursor. If the server does not
            appear, check{" "}
            <strong className="font-medium text-foreground">Output → MCP Logs</strong> in Cursor.
          </p>
          <Card>
            <CardContent className="p-0 relative">
              <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                <code>{configs.cursor}</code>
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copyConfig("cursor")}
                className="absolute top-3 right-3"
              >
                {copied === "cursor" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied === "cursor" ? "Copied" : "Copy"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="mt-4 text-sm text-muted-foreground">
        For API key authentication, replace{" "}
        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{apiKeyPrefix}</code>{" "}
        with your full API key from the{" "}
        <a href={`/dashboard/${slug}/api-keys`} className="text-primary hover:underline">
          API Keys page
        </a>
        .
      </p>
    </div>
  );
}
