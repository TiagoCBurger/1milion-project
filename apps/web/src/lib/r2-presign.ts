// ============================================================
// Presigned URL helpers for R2 — used by the request/finalize
// upload flow. Signs both PUT (upload) and GET (download/hydrate).
//
// PUT URLs lock Content-Type and Content-Length to the values
// declared at request time, so the client cannot exceed quota
// or smuggle a different MIME than the one we approved.
// ============================================================

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// @smithy/types is hoisted at two minor versions through the AWS SDK
// transitive deps in this monorepo. Cast at the boundary so getSignedUrl
// accepts the S3Client + commands without leaking the mismatch.
type PresignerClient = Parameters<typeof getSignedUrl>[0];
type PresignerCommand = Parameters<typeof getSignedUrl>[1];

let _s3: S3Client | null = null;

function client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
  }
  return _s3;
}

export interface PresignedPutOptions {
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export async function presignPut(
  opts: PresignedPutOptions,
): Promise<{ url: string; expiresAt: string }> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });

  const url = await getSignedUrl(
    client() as unknown as PresignerClient,
    command as unknown as PresignerCommand,
    {
      expiresIn: opts.expiresInSeconds,
      // Sign Content-Type and Content-Length so the client cannot tamper.
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );

  return {
    url,
    expiresAt: new Date(
      Date.now() + opts.expiresInSeconds * 1000,
    ).toISOString(),
  };
}

export interface PresignedGetOptions {
  key: string;
  expiresInSeconds: number;
  responseContentType?: string;
}

export async function presignGet(
  opts: PresignedGetOptions,
): Promise<{ url: string; expiresAt: string }> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: opts.key,
    ResponseContentType: opts.responseContentType,
  });

  const url = await getSignedUrl(
    client() as unknown as PresignerClient,
    command as unknown as PresignerCommand,
    { expiresIn: opts.expiresInSeconds },
  );

  return {
    url,
    expiresAt: new Date(
      Date.now() + opts.expiresInSeconds * 1000,
    ).toISOString(),
  };
}

export function buildR2Key(opts: {
  organizationId: string;
  kind: "images" | "videos";
  fileName: string;
  ext: string;
}): string {
  const safeName = opts.fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const baseName = safeName.replace(/\.[^.]+$/, "") || "upload";
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${opts.organizationId}/${opts.kind}/${timestamp}_${rand}_${baseName}.${opts.ext}`;
}

export function publicR2Url(key: string): string {
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
