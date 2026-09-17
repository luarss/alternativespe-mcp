# alternativespe-mcp

An [MCP](https://modelcontextprotocol.io) server for the **Alternatives Partner API v3** ([altdmp.io](https://docs.altdmp.io/)) — read-only programmatic access to private-market data across Southeast Asia (funded companies, investors, funds, people, service providers).

## Features

- Handles the API-key → bearer-token exchange automatically, with token caching/refresh.
- Exposes each list endpoint with the full POST **filter tree** (`all`/`any`/`not` + operators), plus `search`, `ordering`, `limit`, `offset`.
- Detail-by-UUID tools for every core entity.

## Tools

| Tool | Endpoint | Description |
|------|----------|-------------|
| `search_capital_receivers` | `POST /capital-receivers/` | Funded companies / startups |
| `get_capital_receiver` | `GET /capital-receivers/{uuid}/` | Company detail: financials, cap table, investors, deals, news |
| `search_capital_allocators` | `POST /capital-allocators/` | Investors (VC/PE, corporates, family offices) |
| `get_capital_allocator` | `GET /capital-allocators/{uuid}/` | Investor detail: investments, AUM, commitments, funds, news |
| `search_funds` | `POST /funds/` | Funds (Atlas tier) |
| `get_fund` | `GET /funds/{uuid}/` | Fund detail: performance, AUM, commitments, investments |
| `search_people` | `POST /people/` | Founders, directors, executives |
| `get_person` | `GET /people/{uuid}/` | Person detail: roles, investments, news |
| `search_service_providers` | `POST /service-providers/` | Auditors, legal & professional services |
| `search_investors` | `POST /investors/` | Cross-entity investor discovery |
| `get_reference_data` | `GET /reference-data/` | Enums, countries, industries, themes |

## Setup

```bash
npm install
npm run build
```

Set your API key (obtain credentials from `support@alternatives.pe`):

```bash
export ALTDMP_API_KEY=your_api_key_here
```

## Usage with Claude Desktop / Claude Code

Add to your MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "alternativespe": {
      "command": "node",
      "args": ["/absolute/path/to/alternativespe-mcp/dist/index.js"],
      "env": {
        "ALTDMP_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Or, for local development without building:

```json
{
  "mcpServers": {
    "alternativespe": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/alternativespe-mcp/src/index.ts"],
      "env": { "ALTDMP_API_KEY": "your_api_key_here" }
    }
  }
}
```

## Filtering

`filters` is forwarded verbatim as the API's `filters` body. Combine logical groups with conditions:

```json
{
  "filters": {
    "all": [
      { "op": "eq", "field": "domicile_country_iso_alpha3", "value": "SGP" },
      { "op": "gte", "field": "latest_valuation_usd", "value": 50000000 },
      { "any": [
        { "op": "eq", "field": "is_raising_now", "value": true },
        { "op": "in", "field": "themes_keys", "value": ["themes_payments"] }
      ]}
    ]
  },
  "limit": 50,
  "ordering": "-latest_valuation_usd"
}
```

**Operators:** `eq`, `in` (array), `gt`, `gte`, `lt`, `lte`, `range` (2-element array), `contains`, `isnull`.
**Logical groups:** `all` (AND), `any` (OR), `not` (negate).

Use `get_reference_data` to discover valid field enum values.

## Notes

- Rate limit: 320 requests / rolling 60-second window (enforced by the API).
- Subscription tiers: **Atlas** (all endpoints) and **Allocate** (excludes funds and allocator commitments).
- Tokens are valid for 24 hours; this server refreshes them automatically.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALTDMP_API_KEY` | yes | — | Your Alternatives Partner API key |
| `ALTDMP_BASE_URL` | no | `https://api.altdmp.io/v3` | API base URL override |

## Publishing

Both npm and the MCP Registry publish via **OIDC — no long-lived tokens are stored in this repo.**

### npm (Trusted Publishing / OIDC)

Automated publishing uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/): GitHub Actions authenticates to npm over short-lived OIDC and provenance is generated automatically — no `NPM_TOKEN`.

One-time setup on npmjs.com (after the first version exists — see bootstrapping below): package **Settings → Trusted Publisher → GitHub Actions**, set:

| Field | Value |
|-------|-------|
| Organization / user | `luarss` |
| Repository | `alternativespe-mcp` |
| Workflow filename | `publish-mcp-registry.yml` |
| Environment | `release` |

**Bootstrapping:** a trusted publisher can only be configured once the package already exists, so the very first version must be published manually — `npm publish --access public` locally — then configure the trusted publisher for all subsequent releases.

### MCP Registry

`server.json` is published to the [official MCP Registry](https://registry.modelcontextprotocol.io) via the [`mcp-publisher`](https://github.com/modelcontextprotocol/registry) CLI using GitHub OIDC (`mcp-publisher login github-oidc`) — also tokenless.

### Automated release

Pushing a `v*` tag (e.g. `git tag v0.1.0 && git push origin v0.1.0`) triggers [`.github/workflows/publish-mcp-registry.yml`](.github/workflows/publish-mcp-registry.yml). The job runs in the protected **`release`** GitHub environment (required reviewer + `v*`-tags-only), so a publish waits for manual approval, then publishes to npm (OIDC) and syncs `server.json`'s version to the tag before publishing it to the registry (OIDC).

## License

[WTFPL](LICENSE)
