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
await server.connect(transport);
logger.info("walmart-marketplace-mcp started");
