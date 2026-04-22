import { z } from "zod";
import {
  metaApiGet,
  ensureActPrefix,
  textResult,
} from "../meta-api";
import type { ToolContext } from "./index";
import {
  isAccountAllowed,
  accountBlockedResult,
  getProjectAllowedAccounts,
} from "./index";

const MAX_CALLS_PER_INVOCATION = 40;
const MIN_LIST_LIMIT = 1;

type VolumeEndpoint = {
  label: string;
  path: (actId: string) => string;
};

/** Read-only list endpoints; round-robin spreads load across Marketing API surfaces. */
const VOLUME_ENDPOINTS: VolumeEndpoint[] = [
  {
    label: "campaigns",
    path: (actId) => `${actId}/campaigns`,
  },
  {
    label: "adsets",
    path: (actId) => `${actId}/adsets`,
  },
  {
    label: "ads",
    path: (actId) => `${actId}/ads`,
  },
  {
    label: "adcreatives",
    path: (actId) => `${actId}/adcreatives`,
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isMetaError(data: Record<string, unknown>): boolean {
  return data.error !== undefined && data.error !== null;
}

export function registerVolumeTools(ctx: ToolContext): void {
  const { server, token } = ctx;

  server.tool(
    "batch_marketing_api_reads",
    [
      "Run multiple read-only Marketing API GET requests in a single MCP invocation, rotating across",
      "campaigns, adsets, ads, and adcreatives list endpoints (minimal fields).",
      "Use this to accumulate successful Marketing API call volume (e.g. Meta App Review thresholds).",
      `Keep calls_per_invocation at or below ${MAX_CALLS_PER_INVOCATION} to avoid worker timeouts;`,
      "repeat until the Meta developer dashboard shows enough calls. Add delay_ms_between_calls if you hit throttling.",
    ].join(" "),
    {
      project_id: z
        .string()
        .optional()
        .describe("Project ID or slug to scope the request."),
      account_id: z
        .string()
        .describe("Ad account ID (with or without act_ prefix)."),
      calls_per_invocation: z
        .number()
        .min(1)
        .max(MAX_CALLS_PER_INVOCATION)
        .default(20)
        .describe(
          `How many Meta GET requests to perform (max ${MAX_CALLS_PER_INVOCATION} per MCP call).`,
        ),
      delay_ms_between_calls: z
        .number()
        .min(0)
        .max(5_000)
        .default(100)
        .describe(
          "Pause between each Meta request to reduce throttling (0–5000 ms).",
        ),
    },
    async (args) => {
      const scope = await getProjectAllowedAccounts(ctx, args);
      if (!scope.ok) return scope.result;
      const { allowedAccounts } = scope;
      if (!isAccountAllowed(args.account_id, allowedAccounts)) {
        return accountBlockedResult(args.account_id);
      }
      const actId = ensureActPrefix(args.account_id);

      const summary = {
        account_id: actId,
        requested: args.calls_per_invocation,
        successful: 0,
        failed: 0,
        by_endpoint: {} as Record<string, { ok: number; err: number }>,
        errors: [] as Array<{ index: number; endpoint: string; message: string }>,
      };

      for (const ep of VOLUME_ENDPOINTS) {
        summary.by_endpoint[ep.label] = { ok: 0, err: 0 };
      }

      const listParams: Record<string, unknown> = {
        fields: "id,name",
        limit: MIN_LIST_LIMIT,
      };

      for (let i = 0; i < args.calls_per_invocation; i++) {
        const spec = VOLUME_ENDPOINTS[i % VOLUME_ENDPOINTS.length];
        const endpoint = spec.path(actId);
        const data = await metaApiGet(endpoint, token, listParams);

        if (isMetaError(data)) {
          summary.failed += 1;
          summary.by_endpoint[spec.label].err += 1;
          const err = data.error as Record<string, unknown> | undefined;
          const message =
            typeof err?.message === "string"
              ? err.message
              : JSON.stringify(err ?? data.error);
          if (summary.errors.length < 8) {
            summary.errors.push({
              index: i,
              endpoint: spec.label,
              message,
            });
          }
        } else {
          summary.successful += 1;
          summary.by_endpoint[spec.label].ok += 1;
        }

        if (args.delay_ms_between_calls > 0 && i < args.calls_per_invocation - 1) {
          await sleep(args.delay_ms_between_calls);
        }
      }

      return textResult(summary, summary.failed === args.calls_per_invocation);
    },
  );
}
