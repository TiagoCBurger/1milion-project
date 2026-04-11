export type HotmartCredentialsRow = {
  client_id: string;
  client_secret: string;
  basic_token: string;
  access_token: string | null;
  token_expires_at: string | null;
  webhook_hottok?: string;
};

export async function fetchHotmartCredentialsFromEdge(
  supabaseUrl: string,
  serviceRoleKey: string,
  workspaceId: string
): Promise<HotmartCredentialsRow | null> {
  const res = await fetch(
    `${supabaseUrl}/functions/v1/decrypt-hotmart-credentials`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ workspaceId }),
    }
  );

  if (!res.ok) {
    return null;
  }

  const json = (await res.json()) as { credentials?: HotmartCredentialsRow };
  return json.credentials ?? null;
}
