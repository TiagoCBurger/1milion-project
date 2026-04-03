"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload, ImageIcon, Check } from "lucide-react";
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
  { value: "GET_OFFER", label: "Get Offer" },
];

export function CreateCreativeDialog({
  workspaceId,
  accountId,
  pages,
}: {
  workspaceId: string;
  accountId: string;
  pages: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  // Image upload state
  const [imageHash, setImageHash] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Creative fields
  const [creativeName, setCreativeName] = useState("");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [linkUrl, setLinkUrl] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);

    // Upload
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
        setError(data.error || "Failed to upload image");
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
    if (!imageHash) {
      setError("Upload an image first");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/meta/creatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          page_id: pageId,
          name: creativeName || undefined,
          image_hash: imageHash,
          link_url: linkUrl || undefined,
          message: message || undefined,
          headline: headline || undefined,
          call_to_action_type: ctaType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create creative");
        return;
      }

      setSuccess(data.id);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) {
      setError("");
      setSuccess(null);
      setImageHash("");
      setImagePreview(null);
      setCreativeName("");
      setMessage("");
      setHeadline("");
      setLinkUrl("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Creative
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Ad Creative</DialogTitle>
          <DialogDescription>
            Upload an image and configure your ad creative with page, text, and CTA.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Image Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">1. Upload Image</Label>
            <div
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 p-4 cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="max-h-36 rounded-lg object-contain" />
                  {imageHash && (
                    <div className="absolute -top-2 -right-2 bg-emerald-500 text-white rounded-full p-0.5">
                      <Check className="h-3 w-3" />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground/50 mb-1" />
                  <p className="text-sm text-muted-foreground">Click to select image</p>
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
            {uploading && <p className="text-xs text-muted-foreground">Uploading to R2 and Meta...</p>}
            {imageHash && (
              <p className="text-xs text-muted-foreground font-mono">Hash: {imageHash}</p>
            )}
          </div>

          {/* Step 2: Creative Details */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">2. Creative Details</Label>

            <div className="space-y-2">
              <Label htmlFor="page" className="text-xs text-muted-foreground">Facebook Page</Label>
              <Select value={pageId} onValueChange={setPageId}>
                <SelectTrigger><SelectValue placeholder="Select page" /></SelectTrigger>
                <SelectContent>
                  {pages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="creative-name" className="text-xs text-muted-foreground">Creative Name (optional)</Label>
              <Input
                id="creative-name"
                value={creativeName}
                onChange={(e) => setCreativeName(e.target.value)}
                placeholder="My Ad Creative"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message" className="text-xs text-muted-foreground">Ad Text</Label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="The main text of your ad..."
                rows={3}
                className="flex w-full rounded-xl bg-secondary/60 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 focus:bg-card resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="headline" className="text-xs text-muted-foreground">Headline</Label>
                <Input
                  id="headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="Ad headline"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Call to Action</Label>
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

            <div className="space-y-2">
              <Label htmlFor="link-url" className="text-xs text-muted-foreground">Destination URL</Label>
              <Input
                id="link-url"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </div>

          {success && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                <Check className="h-4 w-4" /> Creative created
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                ID: {success}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || !imageHash || !pageId}>
              {loading ? "Creating..." : "Create Creative"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
