import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

let _s3: S3Client | null = null;

function getS3Client(): S3Client {
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

export interface R2UploadResult {
  key: string;
  publicUrl: string;
  size: number;
}

export async function uploadToR2(
  buffer: Buffer | Uint8Array,
  workspaceId: string,
  type: "images" | "videos",
  fileName: string,
  contentType: string
): Promise<R2UploadResult> {
  const timestamp = Date.now();
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);
  const ext = safeName.split(".").pop() || "bin";
  const baseName = safeName.replace(/\.[^.]+$/, "");
  const key = `${workspaceId}/${type}/${timestamp}_${baseName}.${ext}`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return {
    key,
    publicUrl: `${process.env.R2_PUBLIC_URL}/${key}`,
    size: buffer.length,
  };
}
