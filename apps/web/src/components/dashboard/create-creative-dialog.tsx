"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, ImageIcon } from "lucide-react";
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

interface AdImage {
  id: string;
  image_hash: string;
  r2_url: string | null;
  file_name: string;
}

export function CreateCreativeDialog({
  organizationId,
  accountId,
  pages,
  images,
}: {
  organizationId: string;
  accountId: string;
  pages: { id: string; name: string }[];
  images?: AdImage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedImageHash, setSelectedImageHash] = useState("");
  const [creativeName, setCreativeName] = useState("");
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [linkUrl, setLinkUrl] = useState("");
  const [message, setMessage] = useState("");
  const [headline, setHeadline] = useState("");
  const [ctaType, setCtaType] = useState("LEARN_MORE");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedImageHash) {
      setError("Select an image first");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/meta/creatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          page_id: pageId,
          name: creativeName || undefined,
          image_hash: selectedImageHash,
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
      setSelectedImageHash("");
      setCreativeName("");
      setMessage("");
      setHeadline("");
      setLinkUrl("");
    }
  }

  const availableImages = images ?? [];

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
            Select an uploaded image and configure your ad creative.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Step 1: Select Image */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">1. Select Image</Label>
            {availableImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto rounded-lg border p-2">
                {availableImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setSelectedImageHash(img.image_hash)}
                    className={`relative rounded-md overflow-hidden border-2 transition-all ${
                      selectedImageHash === img.image_hash
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                  >
                    {img.r2_url ? (
                      <img
                        src={img.r2_url}
                        alt={img.file_name}
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="aspect-square w-full flex items-center justify-center bg-muted">
                        <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                    )}
                    {selectedImageHash === img.image_hash && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                          <Check className="h-3 w-3" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No images uploaded yet. Upload an image first using the button above.
                </p>
              </div>
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
            <Button type="submit" disabled={loading || !selectedImageHash || !pageId}>
              {loading ? "Creating..." : "Create Creative"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
