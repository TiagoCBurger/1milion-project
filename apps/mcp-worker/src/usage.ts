import type { Env } from "./types";

interface UsageEvent {
  workspaceId: string;
  apiKeyId: string;
  toolName: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  isError: boolean;
  errorType?: string;
}

/**
 * Logs a usage event to Supabase (fire-and-forget via waitUntil).
 */
export async function logUsage(event: UsageEvent, env: Env): Promise<void> {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/usage_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        workspace_id: event.workspaceId,
        api_key_id: event.apiKeyId,
        tool_name: event.toolName,
        method: event.method,
        status_code: event.statusCode,
        response_time_ms: event.responseTimeMs,
        is_error: event.isError,
        error_type: event.errorType || null,
      }),
    });

    if (!response.ok) {
      console.error("Usage log failed:", response.status);
    }
  } catch (err) {
    console.error("Usage log error:", err);
  }
}
