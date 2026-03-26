#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleTool, toolNames } from "./server.js";
import { logger } from "./utils/logger.js";

const server = new McpServer(
  { name: "walmart-marketplace-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Register all tools from server.ts via the SDK
// Each tool accepts arbitrary JSON object params and delegates to the existing handler map.
for (const name of toolNames) {
  server.tool(
    name,
    // Generic passthrough schema — each handler does its own Zod validation internally
    { params: z.record(z.unknown()).optional() },
    async ({ params }: { params?: Record<string, unknown> }) => {
      try {
        const result = await handleTool(name, params ?? {});
        return {
          content: [{ type: "text" as const, text: typeof result === "string" ? result : JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("tool error", { tool: name, message });
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );
}

logger.info("walmart-marketplace-mcp started", { tools: toolNames.length });

const transport = new StdioServerTransport();
await server.connect(transport);
