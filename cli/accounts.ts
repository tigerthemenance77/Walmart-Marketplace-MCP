import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { allAccounts, saveAccount } from "../src/accounts/manager.js";
import { removeCredential, getCredential } from "../src/credentials/manager.js";
import { verifyAccountCredentials, verifyRawCredentials } from "../src/auth/oauth.js";

const prompt = async (q: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(q);
  rl.close();
  return ans.trim();
};

export const runAccounts = async (args: string[]): Promise<void> => {
  const cmd = args[0];

  if (cmd === "list") {
    const rows = await allAccounts();
    stdout.write("ALIAS          SELLER NAME           SELLER ID    ENV          ADDED\n");
    rows.forEach((a) => {
      stdout.write(`${a.alias.padEnd(14)}${a.sellerName.padEnd(22)}${a.sellerId.padEnd(13)}${a.env.padEnd(13)}${a.addedAt}\n`);
    });
    return;
  }

  if (cmd === "add") {
    const overwrite = args.includes("--overwrite");
    const alias = await prompt("Account alias: ");
    const exists = await getCredential(alias);
    if (exists && !overwrite) throw new Error("Account exists. Use --overwrite to replace.");
    const clientId = await prompt("Client ID: ");
    const clientSecret = await prompt("Client Secret: ");
    const env = ((await prompt("Environment (production/sandbox) [production]: ")) || "production") as "production" | "sandbox";
    const detail = await verifyRawCredentials({ clientId, clientSecret, env });
    await saveAccount({ alias, clientId, clientSecret, sellerId: detail.sellerId, sellerName: detail.sellerName, env, addedAt: new Date().toISOString().slice(0, 10) });
    stdout.write(`Added ${alias}.\n`);
    return;
  }

  if (cmd === "remove") {
    const alias = args[1];
    if (!alias) throw new Error("Usage: accounts remove <alias>");
    const confirm = await prompt(`Remove ${alias}? (y/N): `);
    if (confirm.toLowerCase() !== "y") return;
    await removeCredential(alias);
    stdout.write(`Removed ${alias}.\n`);
    return;
  }

  if (cmd === "verify") {
    const alias = args[1];
    if (!alias) throw new Error("Usage: accounts verify <alias>");
    const detail = await verifyAccountCredentials(alias);
    stdout.write(`Verified ${alias}: ${detail.sellerName} (${detail.sellerId}) [${detail.env}]\n`);
    return;
  }

  throw new Error("Usage: accounts list|add|remove|verify");
};
