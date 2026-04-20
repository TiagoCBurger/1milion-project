"use client";

import { useState, useRef } from "react";
import { Upload, ImageIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";

export function UploadImageDialog({
  organizationId,
  accountId,
  onUploaded,
  trigger,
}: {
  organizationId: string;
  accountId: string;
  onUploaded?: (imageHash: string, r2Url: string) => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ image_hash: string; r2_url: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("account_id", accountId);
      formData.append("name", fileName || file.name);

      const res = await fetch(`/api/organizations/${organizationId}/meta/images`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to upload image");
        return;
      }

      setResult(data);
      onUploaded?.(data.image_hash, data.r2_url);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPreview(null); setResult(null); setError(""); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Upload className="mr-1.5 h-4 w-4" />
            Upload Image
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Image</DialogTitle>
          <DialogDescription>
            Upload an image to use in ad creatives. Stored in R2 and uploaded to Meta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 cursor-pointer hover:border-muted-foreground/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-48 rounded-lg object-contain" />
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Click to select an image</p>
                <p className="text-xs text-muted-foreground/70 mt-1">JPG, PNG up to 30MB</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {fileName && (
            <div className="space-y-2">
              <Label htmlFor="img-name">Image Name</Label>
              <Input
                id="img-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
              />
            </div>
          )}

          {result && (
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                <Check className="h-4 w-4" /> Image uploaded successfully
              </div>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                Hash: {result.image_hash}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading || !preview}>
              {loading ? "Uploading..." : "Upload to Meta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
