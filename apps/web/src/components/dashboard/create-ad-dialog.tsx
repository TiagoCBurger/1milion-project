"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function CreateAdDialog({
  workspaceId,
  accountId,
  adSets,
}: {
  workspaceId: string;
  accountId: string;
  adSets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [adsetId, setAdsetId] = useState(adSets[0]?.id ?? "");
  const [creativeId, setCreativeId] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/meta/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          name,
          adset_id: adsetId,
          creative_id: creativeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create ad");
        return;
      }

      setOpen(false);
      setName("");
      setCreativeId("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Ad
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Ad</DialogTitle>
          <DialogDescription>
            Link a creative to an ad set. The ad will start as paused.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ad-name">Ad Name</Label>
            <Input
              id="ad-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Ad"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Ad Set</Label>
            <Select value={adsetId} onValueChange={setAdsetId}>
              <SelectTrigger><SelectValue placeholder="Select ad set" /></SelectTrigger>
              <SelectContent>
                {adSets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="creative-id">Creative ID</Label>
            <Input
              id="creative-id"
              value={creativeId}
              onChange={(e) => setCreativeId(e.target.value)}
              placeholder="Paste creative ID from the Creatives page"
              required
            />
            <p className="text-xs text-muted-foreground">
              Create a creative in the Creatives section first, then paste its ID here.
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={loading || !adsetId || !creativeId}>
              {loading ? "Creating..." : "Create Ad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
