import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { metaApiGet, textResult } from "../meta-api";

const ADS_ARCHIVE_FIELDS = [
  "ad_creation_time",
  "ad_creative_body",
  "ad_creative_link_caption",
  "ad_creative_link_description",
  "ad_creative_link_title",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "currency",
  "demographic_distribution",
  "funding_entity",
  "impressions",
  "page_id",
  "page_name",
  "publisher_platform",
  "region_distribution",
  "spend",
].join(",");

export function registerLibraryTools(
  server: McpServer,
  token: string,
  tier: string,
): void {
  server.tool(
    "search_ads_archive",
    "Search the Meta Ad Library (public ads archive) for ads matching given search terms. Useful for competitor research and ad transparency.",
    {
      search_terms: z
        .string()
        .describe("Keywords to search for in ad creatives."),
      ad_reached_countries: z
        .array(z.string())
        .describe(
          "Array of ISO country codes the ads reached (e.g. ['US', 'GB']).",
        ),
      ad_type: z
        .string()
        .default("ALL")
        .describe(
          "Type of ads to search for (ALL, POLITICAL_AND_ISSUE_ADS, HOUSING_ADS, etc.).",
        ),
      limit: z
        .number()
        .default(25)
        .describe("Maximum number of results to return."),
    },
    async (args) => {
      const data = await metaApiGet("ads_archive", token, {
        search_terms: args.search_terms,
        ad_type: args.ad_type,
        ad_reached_countries: JSON.stringify(args.ad_reached_countries),
        limit: args.limit,
        fields: ADS_ARCHIVE_FIELDS,
      });

      if ((data as any).error) {
        return textResult(data, true);
      }

      return textResult(data);
    },
  );
}
