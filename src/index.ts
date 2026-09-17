#!/usr/bin/env node
/**
 * MCP server for the Alternatives Partner API v3 (altdmp.io).
 *
 * Exposes the read-only private-market data endpoints (capital receivers,
 * allocators, funds, people, service providers, investors, reference data)
 * as MCP tools over stdio.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AltDmpClient, AltDmpError, type ListParams } from "./client.js";

const apiKey = process.env.ALTDMP_API_KEY;
if (!apiKey) {
  console.error(
    "ALTDMP_API_KEY environment variable is not set. " +
      "Obtain credentials from support@alternatives.pe.",
  );
  process.exit(1);
}

const client = new AltDmpClient({
  apiKey,
  baseUrl: process.env.ALTDMP_BASE_URL,
});

const server = new McpServer({
  name: "alternativespe-mcp",
  version: "0.1.0",
});

// --- Shared schemas ---------------------------------------------------------

// A single filter condition, e.g. {op: "eq", field: "domicile_country_iso_alpha3", value: "SGP"}.
// The filter tree also supports logical groups (all/any/not), so we accept an
// open-ended record and forward it verbatim to the API.
const filterTree = z
  .record(z.any())
  .describe(
    'Filter tree forwarded to the API "filters" body. Use logical groups ' +
      '("all" = AND, "any" = OR, "not" = negate) containing conditions of the ' +
      'form {"op": <operator>, "field": <field>, "value": <value>}. Operators: ' +
      "eq, in, gt, gte, lt, lte, range (2-element array), contains, isnull. " +
      'Example: {"all": [{"op": "eq", "field": "trading_status_key", "value": ' +
      '"operating"}, {"op": "gte", "field": "total_funding_usd", "value": 1e8}]}',
  );

const listShape = {
  filters: filterTree.optional(),
  search: z.string().optional().describe("Full-text search term (query string)."),
  ordering: z
    .string()
    .optional()
    .describe('Field to order by; prefix with "-" for descending.'),
  limit: z.number().int().min(1).max(100).optional().describe("Page size (default API value)."),
  offset: z.number().int().min(0).optional().describe("Pagination offset."),
};

const uuidShape = {
  uuid: z.string().describe("The entity UUID (profile UUID from a list result)."),
};

// --- Helpers ----------------------------------------------------------------

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  if (err instanceof AltDmpError) {
    const detail = err.body ? `\n${JSON.stringify(err.body, null, 2)}` : "";
    return {
      content: [{ type: "text", text: `${err.message}${detail}` }],
      isError: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}

function toListParams(args: Record<string, unknown>): ListParams {
  return {
    filters: args.filters as Record<string, unknown> | undefined,
    search: args.search as string | undefined,
    ordering: args.ordering as string | undefined,
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
  };
}

/** Register a list/filter tool for a collection endpoint. */
function registerList(name: string, path: string, description: string) {
  server.registerTool(
    name,
    { description, inputSchema: listShape },
    async (args) => {
      try {
        return ok(await client.list(path, toListParams(args)));
      } catch (err) {
        return fail(err);
      }
    },
  );
}

/** Register a detail-by-UUID tool for a collection endpoint. */
function registerDetail(name: string, path: string, description: string) {
  server.registerTool(
    name,
    { description, inputSchema: uuidShape },
    async ({ uuid }) => {
      try {
        return ok(await client.get(`${path}/${uuid}/`));
      } catch (err) {
        return fail(err);
      }
    },
  );
}

// --- Tools ------------------------------------------------------------------

registerList(
  "search_capital_receivers",
  "capital-receivers/",
  "List/filter capital receivers (funded companies / startups) in Southeast Asia. " +
    "Supports filters, search, ordering and pagination.",
);
registerDetail(
  "get_capital_receiver",
  "capital-receivers",
  "Get a capital receiver (company) detail by UUID: financials, cap table, " +
    "investors, deals and news.",
);

registerList(
  "search_capital_allocators",
  "capital-allocators/",
  "List/filter capital allocators (investors: VC/PE firms, corporates, family offices).",
);
registerDetail(
  "get_capital_allocator",
  "capital-allocators",
  "Get a capital allocator (investor) detail by UUID: investments, AUM, " +
    "commitments, financials, cap table, funds and news.",
);

registerList("search_funds", "funds/", "List/filter funds. (Atlas subscription tier only.)");
registerDetail(
  "get_fund",
  "funds",
  "Get a fund detail by UUID: performance, AUM, commitments, investments and news.",
);

registerList(
  "search_people",
  "people/",
  "List/filter people (founders, directors, key executives).",
);
registerDetail(
  "get_person",
  "people",
  "Get a person detail by UUID: roles, investments and news.",
);

registerList(
  "search_service_providers",
  "service-providers/",
  "List/filter service providers (auditors, legal and professional services firms).",
);

registerList(
  "search_investors",
  "investors/",
  "Cross-entity investor lookup / discovery across allocators, funds and people.",
);

// Reference data is a plain GET (enums, countries, industries, themes).
server.registerTool(
  "get_reference_data",
  {
    description:
      "Get reference data: enums, countries, industries, themes and other " +
      "controlled vocabularies used by filter fields.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await client.get("reference-data/"));
    } catch (err) {
      return fail(err);
    }
  },
);

// --- Start ------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("alternativespe-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
