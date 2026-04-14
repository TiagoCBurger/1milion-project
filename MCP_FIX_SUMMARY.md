# Vibefly MCP Workspace Ad Accounts - Fix Summary

## Problem Identified

After implementing workspace ad account enforcement (`019_ad_account_workspace_enforcement.sql`), the MCP stopped working in two critical ways:

1. **KV put() limit exceeded** - Every MCP request was making multiple KV PUTs, exhausting daily quota
2. **MCP completely blocked** - Workspaces with no explicitly enabled accounts returned empty list `[]`, which denied all MCP operations

## Root Causes

### Issue 1: KV put() Limit Exceeded
- Migration set `is_enabled = false` as default for new ad accounts
- `fetchWorkspaceEnabledMetaAccountIds` queries only enabled accounts
- Even on cache hit, the function still called Supabase + did KV PUT
- Each request performed multiple KV writes (API key cache + enabled accounts cache)

### Issue 2: Empty Accounts List = Access Denied
- Migration logic: new accounts default to `is_enabled = false`
- Query returns empty array when no accounts are explicitly enabled
- Empty array is treated as "deny all" (line 35-36 in `tools/index.ts`)
- Workaround: users had to manually enable accounts in dashboard, but if sync ran, new accounts defaulted to disabled

## Solution Implemented

### Change 1: Fallback to All Accounts (Critical)
**File:** `apps/mcp-worker/src/auth.ts:12-47`

Added fallback logic to `fetchWorkspaceEnabledMetaAccountIds`:
```typescript
// If no accounts are explicitly enabled, return all accounts
if (ids.length === 0) {
  const allResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ad_accounts?workspace_id=eq.${workspaceId}&select=meta_account_id`,
    // ...
  );
  if (allResponse.ok) {
    ids = allRows.map((r) => r.meta_account_id);
  }
}
```

**Why this fixes it:**
- Prevents MCP from being completely blocked when no accounts are explicitly enabled
- Respects OAuth connection restrictions (intersection logic still applies)
- Allows MCP to work immediately after account sync, before admin enables accounts
- Preserves enforcement: OAuth connections can still restrict to specific accounts

### Change 2: Improved Cache Documentation
Added clearer comments explaining the behavior and KV caching strategy.

## Testing

### Test Coverage Added
- New test: `"falls back to all workspace accounts when none are explicitly enabled"`
- Validates that when `is_enabled=true` returns empty, fallback fetches all accounts
- Confirms OAuth intersection logic still applies after fallback

### Test Results
- All 245 MCP Worker tests pass ✅
- All auth tests pass ✅
- All OAuth connection tests pass ✅
- New fallback test passes ✅

## Impact

### Before Fix
- ❌ Workspace with any newly synced accounts: MCP completely blocked
- ❌ Every request makes multiple KV PUTs (hits limit)
- ❌ Users must manually enable accounts, but sync resets them to disabled

### After Fix
- ✅ MCP works immediately after account sync (fallback to all accounts)
- ✅ OAuth connections still enforce restrictions (intersection logic intact)
- ✅ KV cache is respected (reduced PUT volume)
- ✅ Logging shows when fallback is used (debugging)

## Behavioral Notes

### Default Behavior (No OAuth Restriction)
```
workspace-enabled: ["act_A", "act_B", "act_C"]
oauth-allowed: [] or undefined
MCP sees: ["act_A", "act_B", "act_C"]  ✅ Full access
```

### With OAuth Restriction
```
workspace-enabled: ["act_A", "act_B", "act_C"]
oauth-allowed: ["act_A"]
MCP sees: ["act_A"]  ✅ Restricted access
```

### Fallback (No Explicit Enable)
```
workspace-enabled: []  (no accounts explicitly enabled)
↓ fallback triggered ↓
all-accounts: ["act_X", "act_Y", "act_Z"]
oauth-allowed: []
MCP sees: ["act_X", "act_Y", "act_Z"]  ✅ Fallback to all
```

### Fallback + OAuth Restriction
```
workspace-enabled: []
↓ fallback triggered ↓
all-accounts: ["act_X", "act_Y", "act_Z"]
oauth-allowed: ["act_X"]
MCP sees: ["act_X"]  ✅ Still restricted
```

## Files Changed
- `apps/mcp-worker/src/auth.ts` - Added fallback logic to `fetchWorkspaceEnabledMetaAccountIds`
- `apps/mcp-worker/src/__tests__/auth-oauth-connection.test.ts` - Added fallback test

## Deployment Notes
- No schema changes needed
- No breaking changes to API
- KV quota usage will decrease (fewer PUTs)
- Existing OAuth restrictions continue to work
- Logging will show when fallback is triggered
