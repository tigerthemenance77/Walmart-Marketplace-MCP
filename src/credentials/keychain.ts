import type { SellerAccount } from "../accounts/types.js";

const SERVICE = "walmart-marketplace-mcp";
const key = (alias: string): string => `account:${alias}`;

const loadKeyring = async (): Promise<{ setPassword: Function; getPassword: Function; deletePassword: Function } | null> => {
  try {
    const mod = (await import("keyring")) as unknown as {
      setPassword: Function;
      getPassword: Function;
      deletePassword: Function;
    };
    return mod;
  } catch {
    return null;
  }
};

export const saveAccountToKeychain = async (account: SellerAccount): Promise<boolean> => {
  const keyring = await loadKeyring();
  if (!keyring) return false;
  await keyring.setPassword(SERVICE, key(account.alias), JSON.stringify(account));
  return true;
};

export const loadAccountFromKeychain = async (alias: string): Promise<SellerAccount | null> => {
  const keyring = await loadKeyring();
  if (!keyring) return null;
  const raw = await keyring.getPassword(SERVICE, key(alias));
  return raw ? (JSON.parse(raw) as SellerAccount) : null;
};

export const removeAccountFromKeychain = async (alias: string): Promise<boolean> => {
  const keyring = await loadKeyring();
  if (!keyring) return false;
  await keyring.deletePassword(SERVICE, key(alias));
  return true;
};

export const listAliasesFromKeychain = async (): Promise<string[]> => {
  const keyring = await loadKeyring();
  if (!keyring) return [];
  const aliases: string[] = [];
  for (const probe of ["default", "acme-prod", "acme-sandbox"]) {
    const raw = await keyring.getPassword(SERVICE, key(probe));
    if (raw) aliases.push(probe);
  }
  return aliases;
};
