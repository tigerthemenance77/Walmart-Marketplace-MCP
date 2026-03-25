import { mkdir, appendFile, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(homedir(), ".walmart-marketplace-mcp");
const FILE = join(DIR, "audit.log");

export interface AuditEntry {
  auditId: string;
  timestamp: string;
  accountAlias: string;
  sellerId: string;
  tool: string;
  params: Record<string, unknown>;
  httpMethod: string;
  httpPath: string;
  httpStatus: number;
  success: boolean;
  responseSummary: string;
}

const sanitize = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(/client[_-]?secret/gi, "[REDACTED]").replace(/client[_-]?id/gi, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !["client_id", "client_secret", "access_token", "token"].includes(k))
        .map(([k, v]) => [k, sanitize(v)]),
    );
  }
  return value;
};

export const writeAuditEntry = async (entry: AuditEntry): Promise<void> => {
  await mkdir(DIR, { recursive: true, mode: 0o700 });
  const safe: AuditEntry = {
    ...entry,
    params: sanitize(entry.params) as Record<string, unknown>,
    responseSummary: String(sanitize(entry.responseSummary)).slice(0, 200),
  };
  await appendFile(FILE, `${JSON.stringify(safe)}\n`, { encoding: "utf8" });
  await chmod(FILE, 0o600);
};
