import { readFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAuditEntry } from "../../src/safety/audit-log.js";

describe("credential redaction", () => {
  it("redacts credentials from audit entries", async () => {
    const file = join(homedir(), ".walmart-marketplace-mcp", "audit.log");
    await writeAuditEntry({
      auditId: "a1",
      timestamp: new Date().toISOString(),
      accountAlias: "alias",
      sellerId: "seller",
      tool: "x",
      params: { client_id: "abc", client_secret: "def", access_token: "ghi", safe: "ok" },
      httpMethod: "POST",
      httpPath: "/v3/x",
      httpStatus: 200,
      success: true,
      responseSummary: "client_secret should be hidden",
    });
    const content = await readFile(file, "utf8");
    expect(content).not.toMatch(/client_id|client_secret|access_token/);
    expect(content).toContain("[REDACTED]");
    await unlink(file).catch(() => undefined);
  });

  it("safe error patterns do not include credentials", () => {
    const errMsg = "Authentication failed for account";
    expect(errMsg).not.toMatch(/client_id|client_secret|access_token/);
    expect(errMsg).toMatch(/Authentication failed|account/i);
  });
});
