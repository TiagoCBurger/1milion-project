"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InstallSnippet({ publicKey }: { publicKey: string }) {
  const scriptUrl = process.env.NEXT_PUBLIC_TRACK_SCRIPT_URL ?? "https://track.vibefly.app/s.js";
  const snippet = `<script async src="${scriptUrl}" data-site-id="${publicKey}"></script>`;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Cole este snippet no <code>&lt;head&gt;</code> do seu site:
      </p>
      <div className="flex items-center gap-2">
        <pre className="flex-1 overflow-x-auto rounded-md border border-border/40 bg-muted px-3 py-2 text-xs">
          <code>{snippet}</code>
        </pre>
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span className="ml-2">{copied ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
    </div>
  );
}
