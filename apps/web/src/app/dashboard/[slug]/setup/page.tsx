"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

const MCP_GATEWAY_URL = process.env.NEXT_PUBLIC_MCP_GATEWAY_URL || "https://mcp-api.yourdomain.com";

export default function SetupPage() {
  const { slug } = useParams<{ slug: string }>();
  const [apiKeyPrefix, setApiKeyPrefix] = useState("mads_your_key_here");
  const [activeTab, setActiveTab] = useState<"claude" | "cursor" | "http">("claude");
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

  const tabs = [
    { id: "claude" as const, label: "Claude Desktop" },
    { id: "cursor" as const, label: "Cursor" },
    { id: "http" as const, label: "HTTP / Custom" },
  ];

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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Setup Guide</h1>
      <p className="text-sm text-gray-600 mb-6">
        Copy the configuration for your AI tool and paste your full API key.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Config block */}
      <div className="relative">
        <pre className="rounded-lg bg-gray-900 text-gray-100 p-4 text-sm overflow-x-auto">
          <code>{configs[activeTab]}</code>
        </pre>
        <button
          onClick={() => navigator.clipboard.writeText(configs[activeTab])}
          className="absolute top-2 right-2 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600 transition"
        >
          Copy
        </button>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Replace <code className="bg-gray-100 px-1 rounded">{apiKeyPrefix}</code> with
        your full API key from the{" "}
        <a href={`/dashboard/${slug}/api-keys`} className="text-blue-600 hover:underline">
          API Keys page
        </a>
        .
      </p>
    </div>
  );
}
