import { createInterface } from "node:readline";
import { handleTool, toolNames } from "./server.js";
import { logger } from "./utils/logger.js";

interface RpcReq {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

const writeJson = (obj: unknown): void => {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
};

const writeError = (id: string | number | null, message: string): void => {
  writeJson({ jsonrpc: "2.0", id, error: { code: -32000, message } });
};

export const startServer = (): void => {
  logger.info("walmart-marketplace-mcp started", { tools: toolNames.length });
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    let req: RpcReq;
    try {
      req = JSON.parse(line) as RpcReq;
    } catch {
      writeError(null, "Invalid JSON");
      return;
    }

    try {
      const result = await handleTool(req.method, req.params);
      writeJson({ jsonrpc: "2.0", id: req.id, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal error";
      logger.warn("request failed", { method: req.method, message });
      writeError(req.id, message);
    }
  });
};

startServer();
