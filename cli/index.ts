#!/usr/bin/env node
import { runInit } from "./init.js";
import { runAccounts } from "./accounts.js";

const help = `walmart-marketplace-mcp

Usage:
  walmart-marketplace-mcp init
  walmart-marketplace-mcp accounts list
  walmart-marketplace-mcp accounts add [--overwrite]
  walmart-marketplace-mcp accounts remove <alias>
  walmart-marketplace-mcp accounts verify <alias>
`;

const main = async (): Promise<void> => {
  const [, , ...args] = process.argv;
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    process.stdout.write(help);
    return;
  }

  if (cmd === "init") {
    await runInit();
    return;
  }

  if (cmd === "accounts") {
    await runAccounts(args.slice(1));
    return;
  }

  throw new Error(help);
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
