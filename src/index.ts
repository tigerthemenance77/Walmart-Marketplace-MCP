#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { logger } from "./utils/logger.js";

const server = new McpServer(
  { name: "walmart-marketplace-mcp", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

registerTools(server);

const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (err) {
  logger.error("Failed to start walmart-marketplace-mcp", { error: String(err) });
  process.exit(1);
}

// Normalize null arguments to {} at transport boundary — prevents SDK crash on `arguments: null`
const originalOnMessage = transport.onmessage;
if (originalOnMessage) {
  transport.onmessage = (message) => {
    // Normalize tools/call with null arguments
    if (
      message &&
      typeof message === "object" &&
      "method" in message &&
      (message as Record<string, unknown>).method === "tools/call" &&
      "params" in message
    ) {
      const params = (message as Record<string, unknown>).params as Record<string, unknown> | null | undefined;
      if (params && params.arguments === null) {
        (message as Record<string, unknown>).params = { ...params, arguments: {} };
      }
    }
    return originalOnMessage(message);
  };
}

logger.info("walmart-marketplace-mcp started");
