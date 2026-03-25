# walmart-marketplace-mcp

MCP server for the Walmart Marketplace API. Manage items, orders, inventory, and prices conversationally through Claude Desktop.

Built with a two-layer write safety system: every mutation defaults to `dry_run=true` (preview), and daily-limited operations (like bulk price feeds) are tracked and hard-blocked before you exhaust your quota.

## Prerequisites

- Node.js 18+
- Walmart Marketplace seller account with API access
- Claude Desktop (or any MCP-compatible host)

## Getting Credentials

1. Log in to [Walmart Seller Center](https://sellercentral.walmart.com)
2. Go to **Developer Portal → API Key Management**
3. Create a new API key pair — you'll get a **Client ID** and **Client Secret**

## Quick Start

```bash
# Add your credentials (interactive)
npx walmart-marketplace-mcp init

# Verify credentials work
npx walmart-marketplace-mcp accounts verify <alias>
```

Then add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "walmart-marketplace": {
      "command": "npx",
      "args": ["-y", "walmart-marketplace-mcp"]
    }
  }
}
```

No credentials in the config — they're stored in your OS keychain.

## CLI Commands

| Command | Description |
|---------|-------------|
| `walmart-marketplace-mcp init` | Interactive setup — add first account |
| `walmart-marketplace-mcp accounts list` | Show all configured accounts |
| `walmart-marketplace-mcp accounts add` | Add another account |
| `walmart-marketplace-mcp accounts remove <alias>` | Remove an account |
| `walmart-marketplace-mcp accounts verify <alias>` | Test credentials |

## Account Pinning

Before querying any data, pin an account:

```
User: show me today's orders
Claude → set_account("acme-prod")
Server → 📍 Account set: Acme Selling Co (Alias: acme-prod | Seller ID: 12345678 | ENV: production)

User: what orders came in today?
Claude → get_orders(createdStartDate: "2026-03-25")
Server → 📍 Account: Acme Selling Co (acme-prod) | Found 14 orders...

User: switch to sandbox
Claude → switch_account("acme-sandbox")
Server → ⚠️ Switched from Acme Selling Co (acme-prod) to Acme Selling Co (acme-sandbox). All subsequent operations will target acme-sandbox.
```

Every response shows the `📍 Account:` header — you always know which account's data you're viewing.

## Write Safety

Every write operation defaults to **preview mode** (`dry_run=true`). You see exactly what will change before anything happens:

```
User: update SKU-123 inventory to 100 units
Claude → update_inventory(sku: "SKU-123", quantity: 100, shipNodeId: "CHI-FC", dry_run: true)
Server → Preview:
  SKU: SKU-123
  Current quantity: 50
  Proposed quantity: 100
  Change: +50 units
  Ship node: CHI-FC
  → Call again with dry_run=false to apply this change.

User: looks good, do it
Claude → update_inventory(sku: "SKU-123", quantity: 100, shipNodeId: "CHI-FC", dry_run: false)
Server → ✓ Executed. Audit ID: audit_2026-03-25T18:32:11Z_update_inventory_SKU-123
```

## Rate Limits

Use `get_rate_limits` to check usage at any time:
```
📊 Rate Limit Status (Acme Corp):
Orders (GET):         12/5000 per min   0%
Price update:         78/100  per hour  78% ⚠️
Price feed (bulk):     5/6    per day   83% ⚠️
```

⚠️ warnings appear in tool responses when 80%+ of any limit is used. Hard blocks prevent calls when 100% is reached.

**Critical:** `PRICE_AND_PROMOTION` bulk price feeds are limited to **6/day**. The server tracks usage across restarts in `~/.walmart-marketplace-mcp/feed-usage.json`.

## Tools Reference

### Account Management
| Tool | Severity | Description |
|------|----------|-------------|
| `list_accounts` | READ | List all configured accounts |
| `get_active_account` | READ | Show pinned account |
| `set_account` | LOCAL | Pin an account |
| `switch_account` | LOCAL | Switch accounts |
| `refresh_account_info` | READ | Refresh seller identity |
| `get_rate_limits` | LOCAL | Rate limit dashboard |

### Items
| Tool | Severity | Description |
|------|----------|-------------|
| `get_items` | READ | Browse catalog |
| `get_item` | READ | Get item by SKU/ID |
| `retire_item` | 🚨 DANGER | Remove from Walmart.com (irreversible) |

### Orders
| Tool | Severity | Description |
|------|----------|-------------|
| `get_orders` | READ | List orders with filters |
| `get_order` | READ | Single order details |
| `get_released_orders` | READ | Orders ready to ship |
| `acknowledge_order` | ⚠️ WARN | Acknowledge receipt |
| `ship_order` | ⚠️ WARN | Submit tracking info |

### Inventory
| Tool | Severity | Description |
|------|----------|-------------|
| `get_inventory` | READ | Check stock levels |
| `update_inventory` | ⚠️ WARN | Update single SKU |
| `bulk_update_inventory` | 🚨 DANGER | Bulk update via feed |

### Prices
| Tool | Severity | Description |
|------|----------|-------------|
| `get_promo_price` | READ | Current price + promotions |
| `update_price` | ⚠️ WARN | Update single item price |
| `bulk_update_prices` | 🚨 DANGER | Bulk update via feed (6/day limit) |

### Feeds, Returns, Rules, Settings, Lagtime (see `walmart-marketplace://api-docs` in Claude)

## Security

- Credentials stored in OS keychain — never in config files or env vars
- OAuth tokens in memory only — never persisted to disk
- Every executed write logged to `~/.walmart-marketplace-mcp/audit.log` (no credentials in log)
- Zero write operations without explicit `dry_run=false`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Authentication failed" | Run `walmart-marketplace-mcp accounts verify <alias>` |
| Keychain unavailable | Set `WALMART_MASTER_PASSWORD` env var for encrypted file fallback |
| Rate limit blocked | Use `get_rate_limits` to check usage. Wait for window reset. |
| 6/day feed limit hit | Check `~/.walmart-marketplace-mcp/feed-usage.json`. Resets at midnight UTC. |
| Sandbox testing | Use `--sandbox` flag in `accounts add` to configure sandbox credentials |

## Links

- [Walmart Marketplace Developer Docs](https://developer.walmart.com/api/us/mp)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Issues](https://github.com/tigerthemenance77/Walmart-Marketplace-MCP/issues)
