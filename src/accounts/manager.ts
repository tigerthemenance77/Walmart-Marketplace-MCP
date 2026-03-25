import { getCredential, listCredentials, saveCredential } from "../credentials/manager.js";
import type { AccountContext, SellerAccount, TokenCache } from "./types.js";

let accountContext: AccountContext | null = null;
const tokenCacheByAlias = new Map<string, TokenCache>();

export const setActiveAccount = async (alias: string): Promise<AccountContext> => {
  const account = await getCredential(alias);
  if (!account) throw new Error(`Account alias not found: ${alias}`);

  accountContext = {
    alias: account.alias,
    sellerId: account.sellerId,
    sellerName: account.sellerName,
    env: account.env,
  };
  return accountContext;
};

export const switchActiveAccount = async (alias: string): Promise<{ message: string; context: AccountContext }> => {
  const before = accountContext;
  const next = await setActiveAccount(alias);
  const oldName = before ? `${before.sellerName} (${before.alias})` : "none";
  const msg = `⚠️ Switched from ${oldName} to ${next.sellerName} (${next.alias}). All subsequent operations will target ${next.sellerName}.`;
  return { message: msg, context: next };
};

export const getActiveAccount = (): AccountContext | null => accountContext;

export const requireActiveAccount = (): AccountContext => {
  if (!accountContext) throw new Error("No active account set. Call set_account first.");
  return accountContext;
};

export const accountBanner = (): string => {
  const ctx = requireActiveAccount();
  return `📍 Account: ${ctx.sellerName} (Alias: ${ctx.alias} | Seller ID: ${ctx.sellerId} | ENV: ${ctx.env})`;
};

export const saveAccount = async (account: SellerAccount): Promise<void> => {
  await saveCredential(account);
};

export const allAccounts = async (): Promise<SellerAccount[]> => listCredentials();

export const getTokenCache = (alias: string): TokenCache | undefined => tokenCacheByAlias.get(alias);
export const setTokenCache = (alias: string, cache: TokenCache): void => {
  tokenCacheByAlias.set(alias, cache);
};
export const clearTokenCache = (alias: string): void => {
  tokenCacheByAlias.delete(alias);
};
