import type { SellerAccount } from "../accounts/types.js";
import {
  loadAccountFromKeychain,
  removeAccountFromKeychain,
  saveAccountToKeychain,
} from "./keychain.js";
import { loadAccountsEncrypted, saveAccountsEncrypted } from "./encrypted-file.js";

const inMemory = new Map<string, SellerAccount>();

export const saveCredential = async (account: SellerAccount): Promise<void> => {
  inMemory.set(account.alias, account);
  const saved = await saveAccountToKeychain(account);
  if (!saved) {
    const all = Array.from(inMemory.values());
    await saveAccountsEncrypted(all);
  }
};

export const getCredential = async (alias: string): Promise<SellerAccount | null> => {
  const cached = inMemory.get(alias);
  if (cached) return cached;

  const keychain = await loadAccountFromKeychain(alias);
  if (keychain) {
    inMemory.set(alias, keychain);
    return keychain;
  }

  const fallback = await loadAccountsEncrypted();
  for (const item of fallback) inMemory.set(item.alias, item);
  return inMemory.get(alias) ?? null;
};

export const listCredentials = async (): Promise<SellerAccount[]> => {
  const fallback = await loadAccountsEncrypted();
  for (const item of fallback) inMemory.set(item.alias, item);
  return Array.from(inMemory.values()).sort((a, b) => a.alias.localeCompare(b.alias));
};

export const removeCredential = async (alias: string): Promise<void> => {
  inMemory.delete(alias);
  await removeAccountFromKeychain(alias);
  await saveAccountsEncrypted(Array.from(inMemory.values())).catch(() => undefined);
};
