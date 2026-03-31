"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function NewWorkspacePage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function handleNameChange(value: string) {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc("create_workspace", {
      p_user_id: user.id,
      p_name: name,
      p_slug: slug,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push(`/dashboard/${slug}`);
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6">Create Workspace</h1>
      <p className="text-sm text-gray-600 mb-6">
        Each workspace connects to one Meta Business Manager.
      </p>
      <form onSubmit={handleCreate} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">
            Workspace Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="My Agency"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            pattern="[a-z0-9-]+"
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            placeholder="my-agency"
          />
          <p className="mt-1 text-xs text-gray-500">
            URL-friendly identifier (lowercase, no spaces)
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? "Creating..." : "Create Workspace"}
        </button>
      </form>
    </div>
  );
}
