"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const MCP_GATEWAY_URL = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL || "https://mcp-api.yourdomain.com";

export default function SetupPage() {
  const { slug } = useParams<{ slug: string }>();
  const [apiKeyPrefix, setApiKeyPrefix] = useState("mads_your_key_here");
  const [copied, setCopied] = useState(false);
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

  const configs: Record<string, string> = {
    claude: JSON.stringify(
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
    ),
    cursor: JSON.stringify(
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
    ),
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Setup Guide" },
        ]}
      />
      <div className="p-6 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Setup Guide</h1>
        <p className="text-muted-foreground mb-6">
          Copy the configuration for your AI tool and paste your full API key.
        </p>

        <Tabs defaultValue="claude">
          <TabsList className="mb-4">
            <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
            <TabsTrigger value="http">HTTP / Custom</TabsTrigger>
          </TabsList>

          {["claude", "cursor", "http"].map((tabId) => (
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
                    {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        <p className="mt-4 text-sm text-muted-foreground">
          Replace <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{apiKeyPrefix}</code> with
          your full API key from the{" "}
          <a href={`/dashboard/${slug}/api-keys`} className="text-primary hover:underline">
            API Keys page
          </a>
          .
        </p>
      </div>
    </>
  );
}
