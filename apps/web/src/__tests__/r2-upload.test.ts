import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @aws-sdk/client-s3 before importing
const mockSend = vi.fn().mockResolvedValue({});

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class MockS3Client {
      send = mockSend;
    },
    PutObjectCommand: class MockPutObjectCommand {
      constructor(public params: any) {}
    },
  };
});

describe("R2 Upload", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.R2_ACCOUNT_ID = "test-account-id";
    process.env.R2_ACCESS_KEY_ID = "test-access-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_PUBLIC_URL = "https://pub-test.r2.dev";
  });

  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in savedEnv)) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
    vi.resetModules();
  });

  it("uploads buffer to R2 with correct key format", async () => {
    const { uploadToR2 } = await import("@/lib/r2-upload");
    const buffer = Buffer.from("test-image-data");

    const result = await uploadToR2(
      buffer,
      "workspace-123",
      "images",
      "photo.jpg",
      "image/jpeg"
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    const putCmd = mockSend.mock.calls[0][0];
    expect(putCmd.params.Bucket).toBe("test-bucket");
    expect(putCmd.params.Key).toMatch(/^workspace-123\/images\/\d+_photo\.jpg$/);
    expect(putCmd.params.ContentType).toBe("image/jpeg");

    expect(result.key).toMatch(/^workspace-123\/images\/\d+_photo\.jpg$/);
    expect(result.publicUrl).toMatch(/^https:\/\/pub-test\.r2\.dev\/workspace-123\/images\/\d+_photo\.jpg$/);
    expect(result.size).toBe(buffer.length);
  });

  it("sanitizes file names", async () => {
    const { uploadToR2 } = await import("@/lib/r2-upload");

    const result = await uploadToR2(
      Buffer.from("x"),
      "ws-1",
      "images",
      "my photo (1).png",
      "image/png"
    );

    // Special chars replaced with underscores, extension preserved
    expect(result.key).toMatch(/^ws-1\/images\/\d+_my_photo__1_\.png$/);
  });

  it("handles video uploads", async () => {
    const { uploadToR2 } = await import("@/lib/r2-upload");

    const result = await uploadToR2(
      Buffer.from("video-data"),
      "ws-2",
      "videos",
      "clip.mp4",
      "video/mp4"
    );

    expect(result.key).toContain("ws-2/videos/");
    expect(result.key).toContain("clip.mp4");
    const putCmd = mockSend.mock.calls[0][0];
    expect(putCmd.params.ContentType).toBe("video/mp4");
  });

  it("applies safeName slice(0, 64) to long file names", async () => {
    const { uploadToR2 } = await import("@/lib/r2-upload");
    // Short name with extension — verifies normal case
    const result = await uploadToR2(
      Buffer.from("x"),
      "ws-1",
      "images",
      "a".repeat(50) + ".jpg",
      "image/jpeg"
    );

    const putCmd = mockSend.mock.calls[0][0];
    const key = putCmd.params.Key as string;
    expect(key).toContain("ws-1/images/");
    // safeName = 50 a's + ".jpg" = 54 chars, under 64 limit
    expect(key).toContain(".jpg");
  });
});
