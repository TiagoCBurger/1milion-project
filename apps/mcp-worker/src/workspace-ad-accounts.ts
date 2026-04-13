/**
 * Normalize Meta ad account IDs for comparison (Graph may return with or without act_).
 */
export function normalizeMetaAccountId(id: string): string {
  return id.replace(/^act_/, "");
}

/**
 * MCP effective allow-list: workspace-enabled accounts, optionally restricted by
 * OAuth connection allowed_accounts (empty = no extra MCP filter → full workspace set).
 */
export function intersectAllowedAccounts(
  workspaceEnabledMetaIds: string[],
  oauthAllowedMetaIds: string[] | null | undefined
): string[] {
  if (!oauthAllowedMetaIds || oauthAllowedMetaIds.length === 0) {
    return [...workspaceEnabledMetaIds];
  }
  const oauthNorm = new Set(oauthAllowedMetaIds.map(normalizeMetaAccountId));
  return workspaceEnabledMetaIds.filter((w) =>
    oauthNorm.has(normalizeMetaAccountId(w))
  );
}
