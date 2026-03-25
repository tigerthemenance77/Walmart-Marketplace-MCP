import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SellerAccount } from "../accounts/types.js";

const DIR = join(homedir(), ".walmart-marketplace-mcp");
const FILE = join(DIR, "accounts.enc");

interface EncPayload {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const deriveKey = (password: string, salt: Buffer): Buffer =>
  pbkdf2Sync(password, salt, 600000, 32, "sha512");

export const saveAccountsEncrypted = async (accounts: SellerAccount[]): Promise<void> => {
  const password = process.env.WALMART_MASTER_PASSWORD;
  if (!password) throw new Error("WALMART_MASTER_PASSWORD is required for encrypted fallback storage");

  await mkdir(DIR, { recursive: true, mode: 0o700 });
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const plaintext = Buffer.from(JSON.stringify(accounts), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncPayload = {
    salt: salt.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("base64"),
  };

  await writeFile(FILE, JSON.stringify(payload), { mode: 0o600 });
};

export const loadAccountsEncrypted = async (): Promise<SellerAccount[]> => {
  const password = process.env.WALMART_MASTER_PASSWORD;
  if (!password) return [];

  try {
    const raw = await readFile(FILE, "utf8");
    const payload = JSON.parse(raw) as EncPayload;
    const salt = Buffer.from(payload.salt, "hex");
    const iv = Buffer.from(payload.iv, "hex");
    const tag = Buffer.from(payload.tag, "hex");
    const encrypted = Buffer.from(payload.data, "base64");

    const key = deriveKey(password, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(decrypted) as SellerAccount[];
  } catch {
    return [];
  }
};
