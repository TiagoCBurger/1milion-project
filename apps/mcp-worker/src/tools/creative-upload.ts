// ============================================================
// MCP creative-upload tools — request_creative_upload &
// finalize_creative_upload. Mirror the web routes; bytes never
// transit through the LLM.
//
// These tools forward to the web app's upload endpoints with a
// shared MCP_SERVICE_TOKEN so all sanitization/audit/Meta-call
// logic stays in one place. The MCP host client uploads bytes
// directly to R2 via the presigned URL between the two calls.
// ============================================================

import { z } from "zod";
import { textResult } from "../meta-api";
import type { ToolContext } from "./index";
import {
  isAccountAllowed,
  accountBlockedResult,
  getProjectAllowedAccounts,
} from "./index";
import {
  ALLOWED_IMAGE_MIMES,
  type AllowedImageMime,
} from "@vibefly/shared";

const ALLOWED_MIME_LITERALS = [...ALLOWED_IMAGE_MIMES] as [
  AllowedImageMime,
  ...AllowedImageMime[],
];

interface ForwardOptions {
  webBase: string;
  serviceToken: string;
  organizationId: string;
  path: string;
  body: unknown;
}

async function forwardToWeb(
  opts: ForwardOptions,
): Promise<{ status: number; body: unknown }> {
  const url = `${opts.webBase.replace(/\/$/, "")}/api/organizations/${opts.organizationId}/meta/images/${opts.path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mcp-service-token": opts.serviceToken,
    },
    body: JSON.stringify(opts.body),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { error: `Non-JSON response from web (status ${res.status})` };
  }
  return { status: res.status, body };
}

function configError(): ReturnType<typeof textResult> {
  return textResult(
    {
      error:
        "creative_upload tools require WEB_APP_URL and MCP_SERVICE_TOKEN to be configured on the MCP worker.",
    },
    true,
  );
}

export function registerCreativeUploadTools(ctx: ToolContext): void {
  const { server, env, organizationId, tier } = ctx;

  if (!ctx.enableMetaMutations) return;

  // ── request_creative_upload ──────────────────────────────────────
  server.tool(
    "request_creative_upload",
    "Step 1 of the secure local-file upload flow. Reserves a per-file slot and returns presigned PUT URLs that the host client uploads bytes to (bytes NEVER pass through this MCP). Caller must compute sha256 + size + mime client-side. Pair with finalize_creative_upload.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      files: z
        .array(
          z.object({
            name: z
              .string()
              .min(1)
              .max(256)
              .describe("Filename (used for storage + Meta name)."),
            size: z
              .number()
              .int()
              .positive()
              .describe("Exact byte length of the file."),
            content_type: z
              .enum(ALLOWED_MIME_LITERALS)
              .describe("Declared MIME — must match magic bytes at finalize."),
            sha256: z
              .string()
              .regex(/^[a-f0-9]{64}$/i)
              .describe("Lowercase hex sha256 of the file (locks bytes)."),
          }),
        )
        .min(1)
        .max(200)
        .describe("Files to upload — single or batch."),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      if (!isAccountAllowed(args.account_id, scope.allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }

      if (tier === "free") {
        return textResult(
          {
            error:
              "request_creative_upload requires a Pro or Max subscription. Upgrade at https://vibefly.app/pricing",
          },
          true,
        );
      }

      const webBase = env.WEB_APP_URL?.trim();
      const serviceToken = env.MCP_SERVICE_TOKEN?.trim();
      if (!webBase || !serviceToken) return configError();

      const { status, body } = await forwardToWeb({
        webBase,
        serviceToken,
        organizationId,
        path: "request-upload",
        body: { account_id: args.account_id, files: args.files },
      });

      return textResult(body, status >= 400);
    },
  );

  // ── request_creative_download ────────────────────────────────────
  server.tool(
    "request_creative_download",
    "Returns presigned GET URLs for ad creatives. Already-cached images are served from R2; uncached images are hydrated (fetched from Meta with SSRF protection, sanitized, stored). Hydrated images count against the daily upload quota.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("The ad account ID (with or without act_ prefix)."),
      items: z
        .array(
          z.object({
            image_hash: z
              .string()
              .regex(/^[a-f0-9]{6,64}$/i)
              .describe("Meta image hash (returned by upload or from creative)."),
          }),
        )
        .min(1)
        .max(100)
        .describe("Image hashes to download."),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      if (!isAccountAllowed(args.account_id, scope.allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }

      if (tier === "free") {
        return textResult(
          {
            error:
              "request_creative_download requires a Pro or Max subscription. Upgrade at https://vibefly.app/pricing",
          },
          true,
        );
      }

      const webBase = env.WEB_APP_URL?.trim();
      const serviceToken = env.MCP_SERVICE_TOKEN?.trim();
      if (!webBase || !serviceToken) return configError();

      const { status, body } = await forwardToWeb({
        webBase,
        serviceToken,
        organizationId,
        path: "request-download",
        body: { account_id: args.account_id, items: args.items },
      });
      return textResult(body, status >= 400);
    },
  );

  // ── finalize_creative_upload ─────────────────────────────────────
  server.tool(
    "finalize_creative_upload",
    "Step 2 of the secure local-file upload flow. Validates uploaded bytes against the lease (size, sha256, magic bytes), sanitizes (re-encodes to strip EXIF + neutralize polyglots), forwards to Meta /adimages, and returns image_hash per file. Call after PUTting bytes to every presigned URL from request_creative_upload.",
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      lease_id: z
        .string()
        .uuid()
        .describe("The lease_id returned by request_creative_upload."),
      items: z
        .array(
          z.object({
            key: z
              .string()
              .describe("R2 key from request_creative_upload.items[].key."),
            ad_name: z
              .string()
              .optional()
              .describe("Optional name to tag the image with on Meta."),
          }),
        )
        .optional()
        .describe(
          "Subset of lease items to finalize. Omit to finalize ALL items in the lease.",
        ),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      // account_id is enforced by the lease itself (set at request time);
      // project scoping was already applied during the request call. We
      // still resolve the scope here so unauthorized projects can't
      // finalize someone else's lease via guessed UUIDs.

      const webBase = env.WEB_APP_URL?.trim();
      const serviceToken = env.MCP_SERVICE_TOKEN?.trim();
      if (!webBase || !serviceToken) return configError();

      const body: Record<string, unknown> = { lease_id: args.lease_id };
      if (args.items) body.items = args.items;

      const { status, body: response } = await forwardToWeb({
        webBase,
        serviceToken,
        organizationId,
        path: "finalize-upload",
        body,
      });

      return textResult(response, status >= 400);
    },
  );
}
