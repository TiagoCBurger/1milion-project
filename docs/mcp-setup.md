# Vibefly MCP Server - Setup

## Opção 1: OAuth (recomendado)

Com OAuth, o Claude Code autentica automaticamente via browser — sem necessidade de configurar tokens manualmente.

### Configuração no Claude Code

```bash
claude mcp add --scope project vibefly --transport http "vibefly.app/mcp"
```

Ou manualmente no `.mcp.json` / `settings.local.json`:

```json
{
  "vibefly": {
    "type": "streamable-http",
    "url": "http://localhost:8787/mcp"
  }
}
```

Ao conectar, o Claude Code vai:
1. Descobrir os endpoints OAuth automaticamente via `/.well-known/`
2. Abrir o browser para login e seleção de workspace
3. Autenticar e renovar tokens automaticamente

### Pré-requisitos (servidor)

1. Gerar um `OAUTH_SIGNING_SECRET` compartilhado entre o worker e o web app:
   ```bash
   openssl rand -hex 32
   ```

2. Configurar no MCP Worker:
   ```bash
   wrangler secret put OAUTH_SIGNING_SECRET
   ```

3. Configurar no Web App (`.env.local`):
   ```
   OAUTH_SIGNING_SECRET=<mesmo valor acima>
   ```

4. Criar o KV namespace para OAuth:
   ```bash
   wrangler kv:namespace create OAUTH_KV
   ```
   Atualizar o `id` em `wrangler.toml` com o ID retornado.

5. Configurar as URLs em `wrangler.toml` (produção):
   ```toml
   [vars]
   MCP_SERVER_URL = "https://mcp.vibefly.io"
   WEB_APP_URL = "https://app.vibefly.io"
   ```

---

## Opção 2: API Key (manual)

Para autenticação via API key (`mads_*`), sem fluxo OAuth.

### 1. Configurar variável de ambiente

Adicione ao seu `.zshrc`, `.bashrc` ou `.env`:

```bash
export VIBEFLY_MCP_TOKEN="Bearer <SEU_TOKEN_AQUI>"
```

### 2. Adicionar servidor MCP via CLI

**Escopo do projeto** (`.mcp.json`):

```bash
claude mcp add --scope project vibefly --transport streamable-http "http://localhost:8787/mcp" --header "Authorization:${VIBEFLY_MCP_TOKEN}"
```

**Escopo do usuário:**

```bash
claude mcp add vibefly --transport streamable-http "http://localhost:8787/mcp" --header "Authorization:${VIBEFLY_MCP_TOKEN}"
```

### Configuração equivalente (.mcp.json)

```json
{
  "vibefly": {
    "type": "streamable-http",
    "url": "http://localhost:8787/mcp",
    "headers": {
      "Authorization": "Bearer <SEU_TOKEN_AQUI>"
    }
  }
}
```
