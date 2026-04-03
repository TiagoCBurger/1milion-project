"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, ImageIcon, Check, Upload } from "lucide-react";
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

const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "DOWNLOAD", label: "Download" },
];

export function CreateAdDialog({
  workspaceId,
  accountId,
  adSets,
  creatives,
  pages,
}: {
  workspaceId: string;
  accountId: string;
  adSets: { id: string; name: string }[];
  creatives: { id: string; name: string; thumbnail_url?: string }[];
  pages: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Ad fields
  const [name, setName] = useState("");
  const [adsetId, setAdsetId] = useState(adSets[0]?.id ?? "");
  const [creativeId, setCreativeId] = useState("");

  // New creative mode
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // New creative fields
  const [uploading, setUploading] = useState(false);
  const [imageHash, setImageHash] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");
  const [creativeName, setCreativeName] = useState("");

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("account_id", accountId);
      formData.append("name", file.name);

      const res = await fetch(`/api/workspaces/${workspaceId}/meta/images`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Image upload failed");
        return;
      }
      setImageHash(data.image_hash);
    } catch {
      setError("Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let finalCreativeId = creativeId;

      // If creating a new creative, do that first
      if (mode === "new") {
        if (!imageHash) {
          setError("Upload an image first");
          setLoading(false);
          return;
        }

        const creativeRes = await fetch(`/api/workspaces/${workspaceId}/meta/creatives`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            page_id: pageId,
            name: creativeName || name + " Creative",
            image_hash: imageHash,
            link_url: linkUrl || undefined,
            message: message || undefined,
            headline: headline || undefined,
            call_to_action_type: ctaType,
          }),
        });

        const creativeData = await creativeRes.json();
        if (!creativeRes.ok) {
          setError(creativeData.error || "Failed to create creative");
          setLoading(false);
          return;
        }

        finalCreativeId = creativeData.id;
      }

      if (!finalCreativeId) {
        setError("No creative selected");
        setLoading(false);
        return;
      }

      // Create the ad
      const res = await fetch(`/api/workspaces/${workspaceId}/meta/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          name,
          adset_id: adsetId,
          creative_id: finalCreativeId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create ad");
        return;
      }

      setOpen(false);
      resetForm();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setCreativeId("");
    setMode("existing");
    setImageHash("");
    setImagePreview(null);
    setMessage("");
    setHeadline("");
    setLinkUrl("");
    setCreativeName("");
    setError("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Ad
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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

          {/* Creative: tabs for existing vs new */}
          <div className="space-y-3">
            <Label>Creative</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === "existing" ? "default" : "outline"}
                onClick={() => setMode("existing")}
              >
                Use Existing
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "new" ? "default" : "outline"}
                onClick={() => setMode("new")}
              >
                Create New
              </Button>
            </div>

            {mode === "existing" ? (
              <div className="space-y-2">
                {creatives.length > 0 ? (
                  <Select value={creativeId} onValueChange={setCreativeId}>
                    <SelectTrigger><SelectValue placeholder="Select a creative" /></SelectTrigger>
                    <SelectContent>
                      {creatives.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No creatives found. Switch to "Create New" to build one.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                {/* Image upload */}
                <div
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 p-4 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="max-h-28 rounded-lg object-contain" />
                      {imageHash && (
                        <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full p-0.5">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground/50 mb-1" />
                      <p className="text-xs text-muted-foreground">Click to upload image</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
                {uploading && <p className="text-xs text-muted-foreground">Uploading...</p>}

                {/* Page selector */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Facebook Page</Label>
                  <Select value={pageId} onValueChange={setPageId}>
                    <SelectTrigger><SelectValue placeholder="Select page" /></SelectTrigger>
                    <SelectContent>
                      {pages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Ad text */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Ad Text</Label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Main text of your ad..."
                    rows={2}
                    className="flex w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:bg-card resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Headline</Label>
                    <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Ad headline" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">CTA</Label>
                    <Select value={ctaType} onValueChange={setCtaType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CTA_TYPES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Destination URL</Label>
                  <Input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={
                loading || !adsetId || !name ||
                (mode === "existing" && !creativeId) ||
                (mode === "new" && !imageHash)
              }
            >
              {loading ? "Creating..." : "Create Ad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
