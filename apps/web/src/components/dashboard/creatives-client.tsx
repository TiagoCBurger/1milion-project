"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Upload, ImageIcon, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCreativeDialog } from "@/components/dashboard/create-creative-dialog";

interface AdImage {
  id: string;
  image_hash: string;
  r2_url: string | null;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

export function CreativesClient({
  organizationId,
  accountId,
  pages,
  initialImages,
  canWrite = false,
}: {
  organizationId: string;
  accountId: string;
  pages: { id: string; name: string }[];
  initialImages: AdImage[];
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [images, setImages] = useState<AdImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setError(data.error || "Failed to upload image");
        return;
      }

      // Add to local state immediately
      setImages((prev) => [
        {
          id: data.id,
          image_hash: data.image_hash,
          r2_url: data.r2_url,
          file_name: data.file_name,
          file_size: file.size,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      {/* Upload + Create actions */}
      {canWrite && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload Image"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            className="hidden"
          />

          {pages.length > 0 && (
            <CreateCreativeDialog
              organizationId={organizationId}
              accountId={accountId}
              pages={pages}
              images={images}
            />
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Image gallery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uploaded Images</CardTitle>
          <CardDescription>
            {images.length} image{images.length !== 1 ? "s" : ""} uploaded to this ad account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative rounded-lg border bg-muted/30 overflow-hidden"
                >
                  {img.r2_url ? (
                    <img
                      src={img.r2_url}
                      alt={img.file_name}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="aspect-square w-full flex items-center justify-center bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="p-2 space-y-1">
                    <p className="text-xs font-medium truncate" title={img.file_name}>
                      {img.file_name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                        {img.image_hash.slice(0, 10)}...
                      </Badge>
                      {img.file_size && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatSize(img.file_size)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No images uploaded yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Upload an image to get started
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
