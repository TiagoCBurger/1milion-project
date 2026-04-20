import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCreativeTools } from "../../tools/creatives";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiGet: vi.fn(),
    metaApiPost: vi.fn(),
  };
});

import { metaApiGet, metaApiPost } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Creative Tools", () => {
  let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerCreativeTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });
  });

  describe("get_ad_creatives", () => {
    it("returns creatives for an ad", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "cr_1", name: "Creative 1", status: "ACTIVE" },
        ],
      });

      const result = await callTool("get_ad_creatives", {
        ad_id: "ad_123",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "ad_123/adcreatives",
        TOKEN,
        expect.any(Object),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.data).toHaveLength(1);
    });
  });

  describe("get_ad_image", () => {
    it("returns image info with full URL from hash lookup", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({
          creative: {
            id: "cr_1",
            thumbnail_url: "https://thumb.jpg",
            image_url: "https://image.jpg",
            image_hash: "abc123",
          },
          account_id: "123456",
        })
        .mockResolvedValueOnce({
          data: {
            abc123: {
              url: "https://full-resolution.jpg",
            },
          },
        });

      const result = await callTool("get_ad_image", {
        ad_id: "ad_1",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.thumbnail_url).toBe("https://thumb.jpg");
      expect(data.image_url).toBe("https://image.jpg");
      expect(data.full_image_url).toBe("https://full-resolution.jpg");
    });
  });

  describe("get_ad_video", () => {
    it("returns error when neither ad_id nor video_id provided", async () => {
      const result = await callTool("get_ad_video", {});

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("ad_id or video_id");
    });

    it("fetches video directly by video_id", async () => {
      (metaApiGet as any).mockResolvedValue({
        source: "https://video.mp4",
        picture: "https://thumb.jpg",
        title: "My Video",
        length: 30,
      });

      const result = await callTool("get_ad_video", {
        video_id: "vid_123",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.source_url).toBe("https://video.mp4");
      expect(data.duration).toBe(30);
    });

    it("extracts video_id from ad creative when only ad_id given", async () => {
      (metaApiGet as any)
        .mockResolvedValueOnce({
          data: [
            {
              object_story_spec: {
                video_data: { video_id: "vid_456" },
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          source: "https://video2.mp4",
          picture: "https://thumb2.jpg",
        });

      const result = await callTool("get_ad_video", {
        ad_id: "ad_1",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.video_id).toBe("vid_456");
      expect(data.source_url).toBe("https://video2.mp4");
    });
  });

  describe("get_video_status", () => {
    it("returns ready=true when video_status is ready", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "vid_1",
        title: "My Ad Video",
        length: 15,
        picture: "https://thumb.jpg",
        status: { video_status: "ready", processing_progress: 100 },
      });

      const result = await callTool("get_video_status", { video_id: "vid_1" });
      const data = parseToolResult(result as any) as any;

      expect(data.ready).toBe(true);
      expect(data.processing_status).toBe("ready");
      expect(data.processing_progress).toBe(100);
    });

    it("returns ready=false when still processing", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "vid_1",
        status: { video_status: "processing", processing_progress: 42 },
      });

      const result = await callTool("get_video_status", { video_id: "vid_1" });
      const data = parseToolResult(result as any) as any;

      expect(data.ready).toBe(false);
      expect(data.processing_status).toBe("processing");
    });

    it("surfaces API error as isError", async () => {
      (metaApiGet as any).mockResolvedValue({
        error: { message: "Video not found", code: 100 },
      });

      const result = await callTool("get_video_status", { video_id: "vid_bad" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("upload_ad_image (tier gating)", () => {
    it("blocks non-pro tier", async () => {
      const freeCapture = createToolCapture();
      registerCreativeTools({ server: freeCapture.server, token: TOKEN, tier: "free", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await freeCapture.callTool("upload_ad_image", {
        account_id: "act_123",
        image_url: "https://example.com/img.jpg",
      });

      expect((result as any).isError).toBe(true);
    });

    it("normalizes Meta response to flat hash/url object", async () => {
      (metaApiPost as any).mockResolvedValue({
        images: {
          "my-image.jpg": {
            hash: "abc123hash",
            url: "https://cdn.facebook.com/img.jpg",
            name: "my-image.jpg",
            width: 1200,
            height: 628,
          },
        },
      });

      const result = await callTool("upload_ad_image", {
        account_id: "act_123",
        image_url: "https://example.com/img.jpg",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.hash).toBe("abc123hash");
      expect(data.url).toBe("https://cdn.facebook.com/img.jpg");
      expect(data.width).toBe(1200);
    });

    it("surfaces Meta API error", async () => {
      (metaApiPost as any).mockResolvedValue({
        error: { message: "Invalid image", code: 100 },
      });

      const result = await callTool("upload_ad_image", {
        account_id: "act_123",
        image_url: "https://example.com/img.jpg",
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe("upload_ad_video", () => {
    it("blocks non-pro tier", async () => {
      const freeCapture = createToolCapture();
      registerCreativeTools({ server: freeCapture.server, token: TOKEN, tier: "free", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await freeCapture.callTool("upload_ad_video", {
        account_id: "act_123",
        video_url: "https://example.com/video.mp4",
      });

      expect((result as any).isError).toBe(true);
    });

    it("posts file_url to advideos and returns video_id with note", async () => {
      (metaApiPost as any).mockResolvedValue({ id: "vid_new" });

      const result = await callTool("upload_ad_video", {
        account_id: "act_123",
        video_url: "https://example.com/video.mp4",
        title: "Summer Sale",
      });

      const callArgs = (metaApiPost as any).mock.calls[0];
      expect(callArgs[0]).toBe("act_123/advideos");
      const body = callArgs[2] as Record<string, unknown>;
      expect(body.file_url).toBe("https://example.com/video.mp4");
      expect(body.title).toBe("Summer Sale");

      const data = parseToolResult(result as any) as any;
      expect(data.id).toBe("vid_new");
      expect(data.note).toContain("get_video_status");
    });
  });

  describe("create_ad_creative (validation + tier gating)", () => {
    it("blocks non-pro tier", async () => {
      const freeCapture = createToolCapture();
      registerCreativeTools({ server: freeCapture.server, token: TOKEN, tier: "free", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await freeCapture.callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
        image_hash: "abc123",
        link_url: "https://example.com",
      });

      expect((result as any).isError).toBe(true);
    });

    it("errors when neither image_hash nor video_id is provided", async () => {
      const result = await callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("image_hash");
    });

    it("errors when image_hash provided without link_url", async () => {
      const result = await callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
        image_hash: "abc123",
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("link_url");
    });

    it("creates image creative with link_data", async () => {
      (metaApiPost as any).mockResolvedValue({ id: "cr_new" });

      await callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
        image_hash: "abc123",
        link_url: "https://example.com",
        message: "Check this out",
        headline: "Big Sale",
        call_to_action_type: "SHOP_NOW",
      });

      const callArgs = (metaApiPost as any).mock.calls[0][2];
      const spec = JSON.parse(callArgs.object_story_spec);
      expect(spec.page_id).toBe("page_1");
      expect(spec.link_data.image_hash).toBe("abc123");
      expect(spec.link_data.link).toBe("https://example.com");
      expect(spec.link_data.call_to_action.type).toBe("SHOP_NOW");
    });

    it("creates video creative with video_data", async () => {
      (metaApiPost as any).mockResolvedValue({ id: "cr_vid" });

      await callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
        video_id: "vid_1",
        message: "Watch this",
      });

      const callArgs = (metaApiPost as any).mock.calls[0][2];
      const spec = JSON.parse(callArgs.object_story_spec);
      expect(spec.video_data.video_id).toBe("vid_1");
      expect(spec.video_data.message).toBe("Watch this");
    });
  });
});
