/**
 * Normalize Hotmart Postback 2.0 payload into the same shape used by sync mappers.
 */
export function webhookPayloadToSyncItem(payload: unknown): unknown {
  const o = payload as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return payload;
  const data = o.data;
  if (data && typeof data === "object") return data;
  return payload;
}
