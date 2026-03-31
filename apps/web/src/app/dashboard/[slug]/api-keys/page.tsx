"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";

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

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-6">API Keys</h1>

      {/* Generate new key */}
      <div className="rounded-lg border bg-white p-4 mb-6">
        <h3 className="font-medium mb-3">Generate New Key</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder="Key name"
          />
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            Generate
          </button>
        </div>

        {newKey && (
          <div className="mt-3 rounded bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-700 mb-1">
              Copy this key now - it won&apos;t be shown again:
            </p>
            <code className="text-sm font-mono break-all select-all">{newKey}</code>
          </div>
        )}
      </div>

      {/* Key list */}
      <div className="space-y-2">
        {keys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between rounded-lg border bg-white p-3"
          >
            <div>
              <p className="font-medium text-sm">{key.name}</p>
              <p className="text-xs text-gray-500 font-mono">
                {key.key_prefix}...
              </p>
              {key.last_used_at && (
                <p className="text-xs text-gray-400">
                  Last used: {new Date(key.last_used_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <button
              onClick={() => handleRevoke(key.id)}
              className="text-xs text-red-600 hover:text-red-800"
            >
              Revoke
            </button>
          </div>
        ))}
        {keys.length === 0 && (
          <p className="text-sm text-gray-500">No API keys yet. Generate one above.</p>
        )}
      </div>
    </div>
  );
}
