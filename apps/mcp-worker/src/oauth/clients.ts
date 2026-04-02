import type { StoredClient } from "./types";

const CLIENT_TTL = 30 * 24 * 60 * 60; // 30 days

export async function getClient(
  clientId: string,
  kv: KVNamespace
): Promise<StoredClient | null> {
  return kv.get(`oauth:client:${clientId}`, "json");
}

export async function saveClient(
  client: StoredClient,
  kv: KVNamespace
): Promise<void> {
  await kv.put(`oauth:client:${client.client_id}`, JSON.stringify(client), {
    expirationTtl: CLIENT_TTL,
  });
}
