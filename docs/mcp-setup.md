# Vibefly MCP Server — Setup Guide

## Option 1: OAuth (Recommended)

No API key needed. Claude Code authenticates automatically via browser on first connection.

### Quick start

**Via CLI:**
```bash
claude mcp add --scope project vibefly --transport http "https://mcp-worker.ticburger.workers.dev/mcp"
```

**Or paste directly into `.mcp.json`:**
```json
{
  "mcpServers": {
    "vibefly": {
      "type": "http",
      "url": "https://mcp-worker.ticburger.workers.dev/mcp"
    }
  }
}
```

### How the OAuth flow works

1. Claude Code sends the first MCP request and receives a `401 Unauthorized` response
2. The server returns a `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource`
3. Claude Code auto-registers itself as a client via `/register` (RFC 7591 — no manual step)
4. Your browser opens automatically to the Vibefly consent page
5. Log in (if not already), select your **workspace** and which **ad accounts** to expose
6. Click **Authorize** — tokens are issued and stored automatically
7. Claude Code resumes the original request with the access token

**Token lifecycle:** Access tokens last **1 hour**, refresh tokens last **30 days**. Claude Code renews them automatically in the background — you will not be prompted again until the refresh token expires.

---

## Option 2: API Key (Manual)

For environments where browser-based OAuth is not available.

### 1. Set the environment variable

Add to your `.zshrc`, `.bashrc`, or `.env`:

```bash
export VIBEFLY_MCP_TOKEN="Bearer <YOUR_TOKEN_HERE>"
```

### 2. Add the MCP server via CLI

**Project scope** (saved to `.mcp.json`):
```bash
claude mcp add --scope project vibefly --transport http "https://mcp-worker.ticburger.workers.dev/mcp" --header "Authorization:${VIBEFLY_MCP_TOKEN}"
```

**User scope** (saved to `~/.claude/settings.json`):
```bash
claude mcp add vibefly --transport http "https://mcp-worker.ticburger.workers.dev/mcp" --header "Authorization:${VIBEFLY_MCP_TOKEN}"
```

**Or manually in `.mcp.json`:**
```json
{
  "mcpServers": {
    "vibefly": {
      "type": "http",
      "url": "https://mcp-worker.ticburger.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN_HERE>"
      }
    }
  }
}
```

Get your API key from the **API Keys** page inside the Vibefly dashboard.

---

## Server Setup (for developers / self-hosting)

### Prerequisites

1. Generate a shared `OAUTH_SIGNING_SECRET` between the worker and the web app:
   ```bash
   openssl rand -hex 32
   ```

2. Set the secret in the MCP Worker:
   ```bash
   wrangler secret put OAUTH_SIGNING_SECRET
   ```

3. Set the same secret in the web app (`.env.local`):
   ```
   OAUTH_SIGNING_SECRET=<same value as above>
   ```

4. Create the KV namespace for OAuth state storage:
   ```bash
   wrangler kv:namespace create OAUTH_KV
   ```
   Update the `id` in `wrangler.toml` with the returned ID.

5. Set production URLs in `wrangler.toml`:
   ```toml
   [vars]
   MCP_SERVER_URL = "https://your-worker.workers.dev"
   WEB_APP_URL    = "https://your-app.com"
   ```

6. Deploy:
   ```bash
   cd apps/mcp-worker && wrangler deploy
   ```
