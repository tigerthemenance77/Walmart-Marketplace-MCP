import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveAccount } from "../src/accounts/manager.js";
import { verifyRawCredentials } from "../src/auth/oauth.js";
import { isKeychainAvailable } from "../src/credentials/keychain.js";

const prompt = async (q: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(q);
  rl.close();
  return ans.trim();
};

const promptHidden = async (q: string): Promise<string> => {
  if (!stdin.isTTY) return prompt(q);

  return await new Promise<string>((resolve, reject) => {
    stdout.write(q);
    let value = "";

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk: string) => {
      const ch = chunk;

      if (ch === "\r" || ch === "\n") {
        stdout.write("\n");
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        resolve(value.trim());
        return;
      }

      if (ch === "\u0003") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        reject(new Error("Input cancelled"));
        return;
      }

      if (ch === "\u007f") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }

      value += ch;
      stdout.write("*");
    };

    stdin.on("data", onData);
  });
};

const ensureFallbackPasswordForInit = async (): Promise<void> => {
  const keychainAvailable = await isKeychainAvailable();
  if (keychainAvailable) return;

  const existing = process.env.WALMART_MASTER_PASSWORD?.trim();
  if (existing) return;

  if (!stdin.isTTY) {
    throw new Error(
      "Keychain is unavailable and WALMART_MASTER_PASSWORD is not set. " +
        "Set WALMART_MASTER_PASSWORD in the environment, or rerun `walmart-marketplace-mcp init` in an interactive terminal to be prompted.",
    );
  }

  const masterPassword = await prompt("Master password for encrypted credential storage: ");
  if (!masterPassword) {
    throw new Error("Master password cannot be empty when keychain is unavailable.");
  }

  process.env.WALMART_MASTER_PASSWORD = masterPassword;
};

type InitArgs = {
  alias?: string;
  clientId?: string;
  clientSecret?: string;
  env?: string;
};

const parseInitFlags = (args: string[]): InitArgs => {
  const out: InitArgs = {};
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    const val = args[i + 1];
    if (!key?.startsWith("--")) continue;
    if (!val || val.startsWith("--")) throw new Error(`Missing value for flag ${key}`);
    if (key === "--alias") {
      out.alias = val;
      i += 1;
    } else if (key === "--client-id") {
      out.clientId = val;
      i += 1;
    } else if (key === "--client-secret") {
      out.clientSecret = val;
      i += 1;
    } else if (key === "--env") {
      out.env = val;
      i += 1;
    }
  }
  return out;
};

const maskClientId = (value: string): string => {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

export const runInit = async (args: string[] = []): Promise<void> => {
  const flags = parseInitFlags(args);
  await ensureFallbackPasswordForInit();

  const alias = flags.alias ?? (await prompt("Account alias: "));
  const clientId = flags.clientId ?? (await prompt("Client ID: "));
  const clientSecret = flags.clientSecret ?? (await promptHidden("Client Secret: "));
  const envRaw = flags.env ?? (await prompt("Environment (production/sandbox) [production]: "));
  const env = (envRaw || "production") as "production" | "sandbox";

  const detail = await verifyRawCredentials({ clientId, clientSecret, env });
  const sellerName =
    detail.sellerName || (env === "sandbox" ? "Seller details unavailable (sandbox)" : "Seller details unavailable");
  const sellerId = detail.sellerId || (env === "sandbox" ? "sandbox-unavailable" : "unavailable");
  const allRequiredFromFlags = Boolean(flags.alias && flags.clientId && flags.clientSecret && flags.env);

  stdout.write("\n");
  stdout.write(`Account alias:    ${alias}\n`);
  stdout.write(`Client ID:        ${maskClientId(clientId)}\n`);
  stdout.write(`Environment:      ${env}\n`);
  stdout.write(`Seller:           ${sellerName} (ID: ${sellerId})\n\n`);

  if (!allRequiredFromFlags) {
    const confirm = await prompt("Save this account? [Y/n]: ");
    if (confirm.trim().toLowerCase() === "n") {
      stdout.write("Aborted. Account not saved.\n");
      return;
    }
  }

  await saveAccount({
    alias,
    clientId,
    clientSecret,
    sellerId,
    sellerName,
    env,
    addedAt: new Date().toISOString().slice(0, 10),
  });

  stdout.write(`Saved account ${alias} (${sellerName}).\n`);
  stdout.write(`Claude Desktop config snippet:\n`);
  stdout.write(
    JSON.stringify({ mcpServers: { walmartMarketplace: { command: "walmart-marketplace-mcp" } } }, null, 2) + "\n",
  );
};
