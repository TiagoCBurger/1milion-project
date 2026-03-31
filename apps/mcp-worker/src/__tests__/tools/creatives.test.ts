import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCreativeTools } from "../../tools/creatives";
import { createToolCapture, parseToolResult } from "../helpers";

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
    registerCreativeTools(capture.server, TOKEN, "pro");
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

  describe("upload_ad_image (tier gating)", () => {
    it("blocks non-pro tier", async () => {
      const freeCapture = createToolCapture();
      registerCreativeTools(freeCapture.server, TOKEN, "free");

      const result = await freeCapture.callTool("upload_ad_image", {
        account_id: "act_123",
        image_url: "https://example.com/img.jpg",
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe("create_ad_creative (tier gating)", () => {
    it("blocks non-pro tier", async () => {
      const freeCapture = createToolCapture();
      registerCreativeTools(freeCapture.server, TOKEN, "free");

      const result = await freeCapture.callTool("create_ad_creative", {
        account_id: "act_123",
        page_id: "page_1",
      });

      expect((result as any).isError).toBe(true);
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
