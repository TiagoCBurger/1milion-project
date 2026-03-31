import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metaApiGet, metaApiPost, ensureActPrefix, textResult } from "../meta-api";

const CREATIVE_LIST_FIELDS =
  "id,name,status,thumbnail_url,image_url,image_hash,object_story_spec,object_type,body,title,effective_object_story_id,asset_feed_spec,url_tags,product_set_id";

const CREATIVE_DETAIL_FIELDS =
  "id,name,status,thumbnail_url,image_url,image_hash,object_story_spec,object_type,body,title,effective_object_story_id,asset_feed_spec{images,videos,bodies,titles,descriptions,link_urls,ad_formats,call_to_action_types,optimization_type,asset_customization_rules},url_tags,link_url";

const VIDEO_FIELDS =
  "source,title,description,length,picture,thumbnails,created_time";

export function registerCreativeTools(
  server: McpServer,
  token: string,
  tier: string,
): void {
  // ── get_ad_creatives ────────────────────────────────────────────────
  server.tool(
    "get_ad_creatives",
    "List all creatives associated with a Meta ad account or ad.",
    {
      ad_id: z
        .string()
        .describe("The ad ID to retrieve creatives for."),
    },
    async (args) => {
      const data = await metaApiGet(`${args.ad_id}/adcreatives`, token, {
        fields: CREATIVE_LIST_FIELDS,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── get_creative_details ────────────────────────────────────────────
  server.tool(
    "get_creative_details",
    "Get detailed information about a specific ad creative including asset feed spec and object story spec.",
    {
      creative_id: z
        .string()
        .describe("The creative ID to retrieve details for."),
    },
    async (args) => {
      const data = await metaApiGet(args.creative_id, token, {
        fields: CREATIVE_DETAIL_FIELDS,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── get_ad_image ────────────────────────────────────────────────────
  server.tool(
    "get_ad_image",
    "Get image info and URLs for a Meta ad. Returns thumbnail and image URLs.",
    {
      ad_id: z
        .string()
        .describe("The ad ID to retrieve image information for."),
    },
    async (args) => {
      const data = await metaApiGet(args.ad_id, token, {
        fields: "creative{id,thumbnail_url,image_url,image_hash},account_id",
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      const creative = (data as any).creative ?? {};
      const accountId = (data as any).account_id as string | undefined;
      const imageHash = creative.image_hash as string | undefined;

      const result: Record<string, unknown> = {
        ad_id: args.ad_id,
        thumbnail_url: creative.thumbnail_url ?? null,
        image_url: creative.image_url ?? null,
        image_hash: imageHash ?? null,
        full_image_url: null,
      };

      // If we have both image_hash and account_id, fetch the full-resolution URL
      if (imageHash && accountId) {
        const imagesData = await metaApiGet(
          `act_${accountId}/adimages`,
          token,
          { hashes: [imageHash] },
        );

        if (!(imagesData as any).error) {
          const images = (imagesData as any).data ?? {};
          const imgEntry = images[imageHash] ?? Object.values(images)[0];
          if (imgEntry) {
            result.full_image_url =
              (imgEntry as any).url ?? (imgEntry as any).permalink_url ?? null;
          }
        }
      }

      return textResult(result);
    },
  );

  // ── get_ad_video ────────────────────────────────────────────────────
  server.tool(
    "get_ad_video",
    "Get video info, source URL, and thumbnail for a Meta ad video. Provide either ad_id or video_id.",
    {
      ad_id: z
        .string()
        .optional()
        .describe("The ad ID to extract the video from. One of ad_id or video_id is required."),
      video_id: z
        .string()
        .optional()
        .describe("The video ID to retrieve directly. One of ad_id or video_id is required."),
    },
    async (args) => {
      let resolvedVideoId = args.video_id;

      if (!resolvedVideoId && !args.ad_id) {
        return textResult(
          { error: "Either ad_id or video_id must be provided." },
          true,
        );
      }

      // If only ad_id provided, extract video_id from the creative
      if (!resolvedVideoId && args.ad_id) {
        const creativeData = await metaApiGet(
          `${args.ad_id}/adcreatives`,
          token,
          { fields: "object_story_spec,asset_feed_spec" },
        );

        if ((creativeData as any).error) {
          return textResult(creativeData, true);
        }

        const creatives = ((creativeData as any).data ?? []) as any[];
        for (const c of creatives) {
          // Check object_story_spec.video_data.video_id
          const videoData = c.object_story_spec?.video_data;
          if (videoData?.video_id) {
            resolvedVideoId = videoData.video_id;
            break;
          }

          // Check asset_feed_spec.videos
          const videos = c.asset_feed_spec?.videos;
          if (Array.isArray(videos) && videos.length > 0) {
            resolvedVideoId = videos[0].video_id;
            break;
          }
        }

        if (!resolvedVideoId) {
          return textResult(
            { error: "No video found in the ad creatives." },
            true,
          );
        }
      }

      // Fetch video details
      const videoData = await metaApiGet(resolvedVideoId!, token, {
        fields: VIDEO_FIELDS,
      });

      if ((videoData as any).error) {
        return textResult(videoData, true);
      }

      return textResult({
        video_id: resolvedVideoId,
        source_url: (videoData as any).source ?? null,
        thumbnail_url: (videoData as any).picture ?? null,
        title: (videoData as any).title ?? null,
        description: (videoData as any).description ?? null,
        duration: (videoData as any).length ?? null,
      });
    },
  );

  // ── upload_ad_image (PRO TIER ONLY) ─────────────────────────────────
  server.tool(
    "upload_ad_image",
    "Upload an image to a Meta ad account from a URL. Requires Pro tier.",
    {
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      image_url: z
        .string()
        .describe("The public URL of the image to upload."),
      name: z
        .string()
        .optional()
        .describe("Optional name for the uploaded image."),
    },
    async (args) => {
      if (tier !== "pro") {
        return textResult(
          { error: "upload_ad_image requires a Pro tier subscription." },
          true,
        );
      }

      const accountId = ensureActPrefix(args.account_id);

      const params: Record<string, unknown> = {
        url: args.image_url,
      };
      if (args.name) {
        params.name = args.name;
      }

      const data = await metaApiPost(`${accountId}/adimages`, token, params);

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── create_ad_creative (PRO TIER ONLY) ──────────────────────────────
  server.tool(
    "create_ad_creative",
    "Create a new ad creative with image or video. Requires Pro tier.",
    {
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      page_id: z
        .string()
        .describe("The Facebook Page ID to associate with the creative."),
      name: z
        .string()
        .optional()
        .describe("Name for the ad creative."),
      link_url: z
        .string()
        .optional()
        .describe("The destination URL for the ad."),
      message: z
        .string()
        .optional()
        .describe("The main text/body of the ad post."),
      headline: z
        .string()
        .optional()
        .describe("The headline displayed in the ad."),
      description: z
        .string()
        .optional()
        .describe("The description text shown below the headline."),
      image_hash: z
        .string()
        .optional()
        .describe("The image hash from a previously uploaded image. Provide this for image creatives."),
      video_id: z
        .string()
        .optional()
        .describe("The video ID for video creatives. Provide this for video creatives."),
      call_to_action_type: z
        .string()
        .optional()
        .describe("Call to action button type (e.g. LEARN_MORE, SHOP_NOW, SIGN_UP)."),
      url_tags: z
        .string()
        .optional()
        .describe("URL tags to append to the destination URL for tracking."),
      instagram_actor_id: z
        .string()
        .optional()
        .describe("Instagram account ID for Instagram ad placement."),
    },
    async (args) => {
      if (tier !== "pro") {
        return textResult(
          { error: "create_ad_creative requires a Pro tier subscription." },
          true,
        );
      }

      const accountId = ensureActPrefix(args.account_id);

      // Build object_story_spec based on media type
      const objectStorySpec: Record<string, unknown> = {
        page_id: args.page_id,
      };

      if (args.video_id) {
        // Video creative
        const videoData: Record<string, unknown> = {
          video_id: args.video_id,
        };
        if (args.message) videoData.message = args.message;
        if (args.headline) videoData.title = args.headline;
        if (args.link_url) videoData.link_url = args.link_url;
        if (args.call_to_action_type && args.link_url) {
          videoData.call_to_action = {
            type: args.call_to_action_type,
            value: { link: args.link_url },
          };
        }
        objectStorySpec.video_data = videoData;
      } else if (args.image_hash) {
        // Image creative
        const linkData: Record<string, unknown> = {
          image_hash: args.image_hash,
        };
        if (args.link_url) linkData.link = args.link_url;
        if (args.message) linkData.message = args.message;
        if (args.headline) linkData.name = args.headline;
        if (args.description) linkData.description = args.description;
        if (args.call_to_action_type && args.link_url) {
          linkData.call_to_action = {
            type: args.call_to_action_type,
            value: { link: args.link_url },
          };
        }
        objectStorySpec.link_data = linkData;
      }

      if (args.instagram_actor_id) {
        objectStorySpec.instagram_actor_id = args.instagram_actor_id;
      }

      const params: Record<string, unknown> = {
        object_story_spec: JSON.stringify(objectStorySpec),
      };
      if (args.name) params.name = args.name;
      if (args.url_tags) params.url_tags = args.url_tags;

      const data = await metaApiPost(
        `${accountId}/adcreatives`,
        token,
        params,
      );

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );

  // ── update_ad_creative (PRO TIER ONLY) ──────────────────────────────
  server.tool(
    "update_ad_creative",
    "Update an ad creative. Note: Meta API only reliably allows updating the name. To change content, create a new creative.",
    {
      creative_id: z
        .string()
        .describe("The creative ID to update."),
      name: z
        .string()
        .optional()
        .describe("New name for the ad creative."),
    },
    async (args) => {
      if (tier !== "pro") {
        return textResult(
          { error: "update_ad_creative requires a Pro tier subscription." },
          true,
        );
      }

      const params: Record<string, unknown> = {};
      if (args.name) params.name = args.name;

      const data = await metaApiPost(args.creative_id, token, params);

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );
}
