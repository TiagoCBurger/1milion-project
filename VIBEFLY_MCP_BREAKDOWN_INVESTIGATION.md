# Vibefly MCP Breakdown Investigation

**Date:** 2026-04-13  
**Issue:** MCP stopped working after implementing workspace ad account enforcement

## Root Causes Found

### 1. **KV put() Limit Exceeded - Performance Regression**

**Location:** `apps/mcp-worker/src/auth.ts:65-68` and `auth.ts:121-123`

**Problem:**
- `validateApiKey` caches the workspace context but **still calls `fetchWorkspaceEnabledMetaAccountIds`** even on cache hit
- `fetchWorkspaceEnabledMetaAccountIds` does a PUT to KV every time (line 43)
- **Each MCP request now performs 2+ KV PUTs** (API key cache + enabled accounts cache)
- With high volume, this exceeds "KV put() limit exceeded for the day"

**Flow:**
1. Request comes in with API key
2. Check KV cache for API key (HIT) → ctxBase is retrieved from cache
3. Call `fetchWorkspaceEnabledMetaAccountIds` → does another query to Supabase + **PUT to KV** (unnecessary!)
4. Return workspace context with allowedAccounts

**Impact:** Every cached API key validation still makes a Supabase query + KV write. Defeats caching benefits.

---

### 2. **Empty Allowed Accounts List = Denies Everything**

**Location:** 
- `supabase/migrations/019_ad_account_workspace_enforcement.sql:11-12` (sets new accounts to `is_enabled = false`)
- `apps/mcp-worker/src/tools/index.ts:35-36` (isAccountAllowed logic)

**Problem:**
```sql
ALTER TABLE public.ad_accounts
    ALTER COLUMN is_enabled SET DEFAULT false;
```

After migration:
- Any **new ad account** defaults to `is_enabled = false`
- If sync runs and creates new accounts → they're all disabled
- `fetchWorkspaceEnabledMetaAccountIds` queries `is_enabled = true` → returns empty array `[]`
- Empty array is treated as "workspace has 0 enabled accounts" → MCP denies all operations

**isAccountAllowed logic (index.ts:35-36):**
```typescript
if (allowedAccounts === undefined) return true;   // No list = allow any
if (allowedAccounts.length === 0) return false;   // Empty list = deny all
```

**Impact:** Any workspace with newly synced accounts (or accounts that weren't explicitly enabled) has MCP completely blocked.

---

### 3. **Missing Intersection Logic in validateApiKey**

**Location:** `apps/mcp-worker/src/auth.ts:125-128`

**Problem:**
- `validateApiKey` loads workspace-enabled accounts but **doesn't apply OAuth connection filters**
- In `verifyOAuthAccessToken`, there's `intersectAllowedAccounts(workspaceEnabled, oauthAllowed)`
- But `validateApiKey` just returns the workspace list as-is
- API keys should also respect OAuth connection-level allowlists (if present)

**Current behavior:**
```typescript
const enabledIds = await fetchWorkspaceEnabledMetaAccountIds(row.workspace_id, env);
return {
  ok: true,
  workspace: { ...ctxBase, allowedAccounts: enabledIds },
};
```

---

## Solutions Needed

### Fix 1: Cache the enabled accounts list (avoid redundant KV puts)

In `validateApiKey`, when using cached API key context, don't re-fetch enabled accounts:

```typescript
if (cached) {
  const ctxBase = cached as Omit<WorkspaceContext, "allowedAccounts">;
  const cacheKeyAccounts = `enabled_ad_accounts:${ctxBase.workspaceId}`;
  let enabledIds = await env.CACHE_KV.get(cacheKeyAccounts, "json") as string[] | null;
  
  if (!enabledIds) {
    enabledIds = await fetchWorkspaceEnabledMetaAccountIds(ctxBase.workspaceId, env);
  }
  
  return {
    ok: true,
    workspace: { ...ctxBase, allowedAccounts: enabledIds },
  };
}
```

### Fix 2: Default enabled accounts to workspace accounts (not empty)

When sync creates new accounts, they should default to enabled IF the workspace has no explicit restrictions:

Option A (Database-level): Change migration to default `is_enabled = true` for new accounts during sync
Option B (Code-level): In `fetchWorkspaceEnabledMetaAccountIds`, fallback to ALL accounts if none are explicitly enabled

```typescript
export async function fetchWorkspaceEnabledMetaAccountIds(
  workspaceId: string,
  env: Env
): Promise<string[]> {
  const cacheKey = `enabled_ad_accounts:${workspaceId}`;
  const cached = await env.CACHE_KV.get(cacheKey, "json");
  if (cached && Array.isArray(cached)) {
    return cached as string[];
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ad_accounts?workspace_id=eq.${workspaceId}&is_enabled=eq.true&select=meta_account_id`,
    // ...
  );

  if (!response.ok) {
    console.error("[auth] enabled ad_accounts fetch failed:", response.status);
    return [];
  }

  const rows = (await response.json()) as Array<{ meta_account_id: string }>;
  const ids = rows.map((r) => r.meta_account_id);
  
  // NEW: If no accounts are explicitly enabled, return ALL accounts
  // This prevents MCP from being completely blocked
  if (ids.length === 0) {
    const allResponse = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ad_accounts?workspace_id=eq.${workspaceId}&select=meta_account_id`,
      // ...
    );
    
    if (allResponse.ok) {
      const allRows = (await allResponse.json()) as Array<{ meta_account_id: string }>;
      const allIds = allRows.map((r) => r.meta_account_id);
      await env.CACHE_KV.put(cacheKey, JSON.stringify(allIds), {
        expirationTtl: ENABLED_AD_ACCOUNTS_CACHE_TTL,
      });
      return allIds;
    }
  }

  await env.CACHE_KV.put(cacheKey, JSON.stringify(ids), {
    expirationTtl: ENABLED_AD_ACCOUNTS_CACHE_TTL,
  });
  return ids;
}
```

### Fix 3: Apply intersection logic in validateApiKey (consistency)

```typescript
const enabledIds = await fetchWorkspaceEnabledMetaAccountIds(row.workspace_id, env);
// TODO: If API keys have associated OAuth connections, apply intersection filter
return {
  ok: true,
  workspace: { ...ctxBase, allowedAccounts: enabledIds },
};
```

---

## Testing

The test file `apps/mcp-worker/src/__tests__/auth-oauth-connection.test.ts:146-153` shows the expected behavior:

```typescript
it("intersects OAuth allowed_accounts with workspace-enabled accounts", async () => {
  oauthConnectionRows = [];
  workspaceEnabledMetaIds = ["act_other"];
  const result = requireAuthOk(await verifyOAuthAccessToken("test-token", env));
  expect(result.workspace.allowedAccounts).toEqual([]);
});
```

This test expects that if:
- Workspace has enabled: `["act_other"]`
- OAuth stored has: `["act_from_kv"]`
- Result should be: `[]` (intersection is empty)

This is correct enforcement, but the fallback logic needs to prevent the empty list from being treated as "deny all".

---

## Recommended Action

1. **Immediate (Critical):** Change `fetchWorkspaceEnabledMetaAccountIds` to fallback to all accounts if none are explicitly enabled
2. **Short-term (Important):** Fix KV cache logic in `validateApiKey` to avoid redundant puts
3. **Long-term:** Consider if `is_enabled = false` default is the right model for new accounts
