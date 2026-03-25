import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { saveAccount } from "../src/accounts/manager.js";
import { verifyRawCredentials } from "../src/auth/oauth.js";

const prompt = async (q: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(q);
  rl.close();
  return ans.trim();
};

export const runInit = async (): Promise<void> => {
  const alias = await prompt("Account alias: ");
  const clientId = await prompt("Client ID: ");
  const clientSecret = await prompt("Client Secret: ");
  const env = ((await prompt("Environment (production/sandbox) [production]: ")) || "production") as "production" | "sandbox";

  const detail = await verifyRawCredentials({ clientId, clientSecret, env });
  await saveAccount({ alias, clientId, clientSecret, sellerId: detail.sellerId, sellerName: detail.sellerName, env, addedAt: new Date().toISOString().slice(0, 10) });

  stdout.write(`Saved account ${alias} (${detail.sellerName}).\n`);
  stdout.write(`Claude Desktop config snippet:\n`);
  stdout.write(JSON.stringify({ mcpServers: { walmartMarketplace: { command: "walmart-marketplace-mcp" } } }, null, 2) + "\n");
};
