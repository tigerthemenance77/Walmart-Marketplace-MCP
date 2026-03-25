# Walmart Marketplace MCP (Phase 1)

Read+write MCP server for Walmart Marketplace API v3 with OAuth2, account pinning, dry-run write safety, proactive rate limiting, and write audit logging.

## Features
- OAuth2 client credentials with in-memory token cache + auto-refresh
- OS keychain credentials with AES-256-GCM encrypted-file fallback
- MCP tools for accounts, items, orders, inventory, and prices
- `dry_run: true` default on all write tools
- Proactive rate limiter (warn at 80%, block at 100%)
- JSONL audit log at `~/.walmart-marketplace-mcp/audit.log`
- CLI commands: `init` and `accounts` management

## Install
```bash
npm install
npm run build
```

## Run MCP server (stdio)
```bash
node dist/index.js
```

## CLI
```bash
node dist/cli/index.js --help
node dist/cli/index.js init
node dist/cli/index.js accounts list
```

## Security notes
- `client_id` / `client_secret` are never returned by tools.
- OAuth tokens are never persisted; memory cache only.
- Auth failures are redacted and direct users to `accounts verify`.
