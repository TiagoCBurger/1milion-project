"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, ImageIcon, Check, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useRequirePlan } from "@/hooks/use-require-plan";
import { UpgradePaywallDialog } from "@/components/billing/upgrade-paywall-dialog";

const CTA_TYPES = [
  { value: "LEARN_MORE", label: "Learn More" },
  { value: "SHOP_NOW", label: "Shop Now" },
  { value: "SIGN_UP", label: "Sign Up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "CONTACT_US", label: "Contact Us" },
  { value: "DOWNLOAD", label: "Download" },
];

interface AdImage {
  id: string;
  image_hash: string;
  r2_url: string | null;
  file_name: string;
}

export function CreateAdDialog({
  organizationId,
  accountId,
  adSets,
  creatives,
  pages,
  images,
}: {
  organizationId: string;
  accountId: string;
  adSets: { id: string; name: string }[];
  creatives: { id: string; name: string; thumbnail_url?: string }[];
  pages: { id: string; name: string }[];
  images: AdImage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { guard, paywallOpen, setPaywallOpen } = useRequirePlan("pro");

  // Ad fields
  const [name, setName] = useState("");
  const [adsetId, setAdsetId] = useState(adSets[0]?.id ?? "");
  const [creativeId, setCreativeId] = useState("");

  // Creative mode
  const [mode, setMode] = useState<"existing" | "new">("existing");

  // Image selection / upload
  const [imageHash, setImageHash] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // New creative fields
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");
  const [creativeName, setCreativeName] = useState("");

  function selectExistingImage(img: AdImage) {
    setImageHash(img.image_hash);
    setImagePreview(img.r2_url);
  }

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

      const res = await fetch(`/api/organizations/${organizationId}/meta/images`, {
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
      // Build the request body based on mode
      const adBody: Record<string, unknown> = {
        account_id: accountId,
        name,
        adset_id: adsetId,
      };

      if (mode === "existing") {
        if (!creativeId) {
          setError("No creative selected");
          setLoading(false);
          return;
        }
        adBody.creative_id = creativeId;
      } else {
        // "new" mode: send inline creative fields — the ad route builds object_story_spec
        if (!imageHash) {
          setError("Select or upload an image first");
          setLoading(false);
          return;
        }
        adBody.page_id = pageId;
        adBody.image_hash = imageHash;
        adBody.link_url = linkUrl;
        if (message) adBody.message = message;
        if (headline) adBody.headline = headline;
        adBody.call_to_action_type = ctaType;
      }

      const res = await fetch(`/api/organizations/${organizationId}/meta/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adBody),
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.meta_error
          ? ` (code ${data.meta_error.code ?? "?"}${data.meta_error.error_subcode ? `/${data.meta_error.error_subcode}` : ""})`
          : "";
        setError((data.error || "Failed to create ad") + detail);
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
    <>
      <Button size="sm" onClick={guard(() => setOpen(true))}>
        <Plus className="mr-1.5 h-4 w-4" />
        New Ad
      </Button>
      <UpgradePaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason="Publique anúncios direto do dashboard."
      />
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
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
                    No creatives found. Switch to &quot;Create New&quot; to build one.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                {/* Image: select from gallery or upload */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Image</Label>

                  {/* Selected image preview */}
                  {imagePreview && (
                    <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                      {/* Next/Image requires a width/height or fill parent; this is a fixed-size preview that already constrains itself via Tailwind. Using the sanitizer-served R2 URL so eager load is cheap. */}
                      <Image
                        src={imagePreview}
                        alt="Selected"
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-md object-cover"
                        unoptimized
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">Image selected</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{imageHash.slice(0, 16)}...</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => { setImageHash(""); setImagePreview(null); }}
                        className="text-xs"
                      >
                        Change
                      </Button>
                    </div>
                  )}

                  {/* Gallery + upload (shown when no image selected) */}
                  {!imagePreview && (
                    <>
                      {images.length > 0 && (
                        <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto rounded-md border p-1.5">
                          {images.map((img) => (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => selectExistingImage(img)}
                              className={`relative rounded overflow-hidden border-2 transition-all ${
                                imageHash === img.image_hash
                                  ? "border-primary ring-1 ring-primary/20"
                                  : "border-transparent hover:border-muted-foreground/30"
                              }`}
                              title={img.file_name}
                            >
                              {img.r2_url ? (
                                <div className="relative aspect-square w-full">
                                  <Image
                                    src={img.r2_url}
                                    alt={img.file_name}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <div className="aspect-square w-full flex items-center justify-center bg-muted">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      <div
                        className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-3 cursor-pointer hover:border-muted-foreground/50 transition-colors"
                        onClick={() => fileRef.current?.click()}
                      >
                        {uploading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="h-4 w-4 text-muted-foreground/50" />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {uploading ? "Uploading..." : "Upload new image"}
                        </p>
                        <input
                          ref={fileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </div>
                    </>
                  )}
                </div>

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
                  <Input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" required />
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
                (mode === "new" && (!imageHash || !linkUrl || !pageId))
              }
            >
              {loading ? "Creating..." : "Create Ad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
