"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import { Plus, Copy, Check, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  name: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { slug } = useParams<{ slug: string }>();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyName, setNewKeyName] = useState("Default");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  const loadKeys = useCallback(async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, is_active, last_used_at, created_at")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setKeys(data ?? []);
  }, [workspaceId, supabase]);

  useEffect(() => {
    async function init() {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .single();
      if (data) setWorkspaceId(data.id);
    }
    init();
  }, [slug, supabase]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function handleGenerate() {
    if (!workspaceId) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase.rpc("generate_api_key", {
      p_workspace_id: workspaceId,
      p_created_by: user.id,
      p_name: newKeyName,
    });

    if (data && data[0]) {
      setNewKey(data[0].raw_key);
      loadKeys();
    }
    if (error) console.error(error);
    setLoading(false);
  }

  async function handleRevoke(keyId: string) {
    await supabase
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", keyId);
    loadKeys();
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "API Keys" },
        ]}
      />
      <div className="p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Generate API keys to authenticate your MCP clients.
          </p>
        </div>

        {/* Generate new key */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generate New Key</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="keyName" className="sr-only">Key name</Label>
                <Input
                  id="keyName"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name"
                />
              </div>
              <Button onClick={handleGenerate} disabled={loading}>
                <Plus className="mr-2 h-4 w-4" />
                Generate
              </Button>
            </div>

            {newKey && (
              <div className="mt-4 rounded-xl bg-amber-50/60 p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-amber-700 font-medium">
                    Copy this key now — it won&apos;t be shown again:
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(newKey)}
                    className="h-7 px-2"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
                <code className="text-sm font-mono break-all select-all block">{newKey}</code>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Key list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Keys</CardTitle>
            <CardDescription>{keys.length} key{keys.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {keys.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {key.key_prefix}...
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleDateString()
                          : "Never"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(key.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(key.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No API keys yet. Generate one above.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
