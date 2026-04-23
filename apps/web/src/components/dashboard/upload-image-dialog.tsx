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
import { useRequirePlan } from "@/hooks/use-require-plan";
import { UpgradePaywallDialog } from "@/components/billing/upgrade-paywall-dialog";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 30 * 1024 * 1024;

type Phase = "idle" | "hashing" | "requesting" | "uploading" | "finalizing" | "done";

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ image_hash: string; r2_url: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { allowed, paywallOpen, setPaywallOpen } = useRequirePlan("pro");

  const loading = phase !== "idle" && phase !== "done";

  function reset() {
    setPhase("idle");
    setProgress(0);
    setError("");
    setResult(null);
    setPreview(null);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    setPhase("idle");
    setProgress(0);
    if (!ALLOWED_MIMES.has(file.type)) {
      setError(`Unsupported type ${file.type || "(unknown)"}. Use JPG, PNG, or WebP.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 30MB.`);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);

    try {
      setPhase("hashing");
      const sha256 = await sha256Hex(file);

      setPhase("requesting");
      const reqRes = await fetch(
        `/api/organizations/${organizationId}/meta/images/request-upload`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account_id: accountId,
            files: [
              {
                name: file.name,
                size: file.size,
                content_type: file.type,
                sha256,
              },
            ],
          }),
        },
      );
      const reqData = await reqRes.json();
      if (!reqRes.ok) {
        setError(reqData.error || "Failed to request upload slot");
        setPhase("idle");
        return;
      }
      const lease_id: string = reqData.lease_id;
      const slot = reqData.items?.[0] as
        | { key: string; upload_url: string }
        | undefined;
      if (!slot) {
        setError("Server returned no upload slot");
        setPhase("idle");
        return;
      }

      setPhase("uploading");
      setProgress(0);
      await putWithProgress(slot.upload_url, file, file.type, setProgress);

      setPhase("finalizing");
      const finRes = await fetch(
        `/api/organizations/${organizationId}/meta/images/finalize-upload`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lease_id,
            items: [{ key: slot.key, ad_name: fileName || file.name }],
          }),
        },
      );
      const finData = await finRes.json();
      if (!finRes.ok) {
        setError(finData.error || "Finalize failed");
        setPhase("idle");
        return;
      }

      const item = finData.items?.[0];
      if (!item?.ok) {
        setError(item?.reason || "Finalize rejected the upload");
        setPhase("idle");
        return;
      }

      setResult({ image_hash: item.image_hash, r2_url: item.r2_url });
      setPhase("done");
      onUploaded?.(item.image_hash, item.r2_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("idle");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: "Upload to Meta",
    hashing: "Hashing…",
    requesting: "Reserving slot…",
    uploading: `Uploading… ${progress}%`,
    finalizing: "Sanitizing & sending to Meta…",
    done: "Uploaded",
  };

  return (
    <>
      <UpgradePaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        reason="Suba imagens para seus anúncios direto do dashboard."
      />
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v && !allowed) {
          setPaywallOpen(true);
          return;
        }
        setOpen(v);
        if (!v) reset();
      }}
    >
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
            Upload an image to use in ad creatives. Bytes go directly to R2,
            then are sanitized server-side before reaching Meta.
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
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Preview" className="max-h-48 rounded-lg object-contain" />
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">Click to select an image</p>
                <p className="text-xs text-muted-foreground/70 mt-1">JPG, PNG, WebP up to 30MB</p>
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
                disabled={loading}
              />
            </div>
          )}

          {phase === "uploading" && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
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
              {phaseLabel[phase]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
