"use client";

import { useState } from "react";
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

export function McpSetupGuide() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold tracking-tight mb-1">Guia de setup</h2>
      <p className="text-muted-foreground mb-6">
        Conecte sua ferramenta de IA ao servidor MCP da VibeFly via OAuth (login no navegador na primeira
        conexão).
      </p>

      <Tabs defaultValue="claude">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="claude">Claude Code</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
        </TabsList>

        <TabsContent value="claude">
          <Card>
            <CardContent className="p-0 relative">
              <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                <code>{OAUTH_MCP_CONFIG}</code>
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(OAUTH_MCP_CONFIG, "claude")}
                className="absolute top-3 right-3"
              >
                {copied === "claude" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied === "claude" ? "Copied" : "Copy"}
              </Button>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            Salve como{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.mcp.json</code> na raiz do
            projeto (ou use o CLI abaixo). Na primeira conexão o app abre o navegador para você entrar e
            escolher o organização.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            CLI:{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono break-all">
              claude mcp add --scope project vibefly --transport http &quot;{MCP_GATEWAY_URL}/mcp&quot;
            </code>
          </p>
        </TabsContent>

        <TabsContent value="cursor">
          <p className="text-sm text-muted-foreground mb-3">
            Crie{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">.cursor/mcp.json</code> no
            projeto (pasta <code className="bg-muted px-1 rounded text-xs font-mono">.cursor</code> na raiz
            do repositório), cole o JSON abaixo e feche o Cursor por completo antes de reabrir. Se o servidor
            não aparecer, veja{" "}
            <strong className="font-medium text-foreground">Output → MCP Logs</strong> no Cursor.
          </p>
          <Card>
            <CardContent className="p-0 relative">
              <pre className="rounded-xl bg-neutral-950 text-neutral-100 p-5 text-sm overflow-x-auto font-mono">
                <code>{CURSOR_OAUTH_MCP_CONFIG}</code>
              </pre>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => copy(CURSOR_OAUTH_MCP_CONFIG, "cursor")}
                className="absolute top-3 right-3"
              >
                {copied === "cursor" ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                {copied === "cursor" ? "Copied" : "Copy"}
              </Button>
            </CardContent>
          </Card>
          <p className="mt-3 text-sm text-muted-foreground">
            Não é necessário token manual — na primeira conexão o fluxo OAuth abre o login no navegador.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
