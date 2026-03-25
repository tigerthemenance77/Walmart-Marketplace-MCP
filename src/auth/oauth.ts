import { getCredential } from "../credentials/manager.js";
import { getTokenCache, setTokenCache, clearTokenCache } from "../accounts/manager.js";
import { newCorrelationId } from "../utils/correlation-id.js";

const PROD_BASE = "https://marketplace.walmartapis.com";
const SANDBOX_BASE = "https://sandbox.walmartapis.com";

interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
}

const authError = (): Error =>
  new Error("Authentication failed. Run `walmart-marketplace-mcp accounts verify <alias>` to check credentials.");

export const baseUrlForEnv = (env: "production" | "sandbox"): string =>
  env === "sandbox" ? SANDBOX_BASE : PROD_BASE;

export const fetchAccessToken = async (alias: string, force = false): Promise<string> => {
  const account = await getCredential(alias);
  if (!account) throw authError();

  const cached = getTokenCache(alias);
  if (!force && cached && Date.now() < cached.expiresAt - 120_000) {
    return cached.accessToken;
  }

  const basic = Buffer.from(`${account.clientId}:${account.clientSecret}`).toString("base64");
  const url = `${baseUrlForEnv(account.env)}/v3/token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      "WM_QOS.CORRELATION_ID": newCorrelationId(),
      "WM_SVC.NAME": "Walmart Marketplace",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw authError();
  const payload = (await res.json()) as TokenResponse;
  if (!payload.access_token) throw authError();

  setTokenCache(alias, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  });
  return payload.access_token;
};

export const with401Retry = async <T>(alias: string, fn: (accessToken: string) => Promise<T>): Promise<T> => {
  try {
    const token = await fetchAccessToken(alias);
    return await fn(token);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("401")) throw error;
  }

  clearTokenCache(alias);
  try {
    const token = await fetchAccessToken(alias, true);
    return await fn(token);
  } catch {
    throw authError();
  }
};

export const verifyRawCredentials = async (input: {
  clientId: string;
  clientSecret: string;
  env: "production" | "sandbox";
}): Promise<{ sellerName: string; sellerId: string; env: "production" | "sandbox" }> => {
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64");
  const tokenRes = await fetch(`${baseUrlForEnv(input.env)}/v3/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      "WM_QOS.CORRELATION_ID": newCorrelationId(),
      "WM_SVC.NAME": "Walmart Marketplace",
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw authError();
  const token = (await tokenRes.json()) as TokenResponse;

  const detailRes = await fetch(`${baseUrlForEnv(input.env)}/v3/token/detail`, {
    method: "GET",
    headers: {
      "WM_SEC.ACCESS_TOKEN": token.access_token,
      "WM_QOS.CORRELATION_ID": newCorrelationId(),
      "WM_SVC.NAME": "Walmart Marketplace",
      Accept: "application/json",
    },
  });

  if (!detailRes.ok) throw authError();
  const detail = (await detailRes.json()) as { sellerName?: string; sellerId?: string };
  return { sellerName: detail.sellerName ?? "Unknown Seller", sellerId: detail.sellerId ?? "unknown", env: input.env };
};

export const verifyAccountCredentials = async (
  alias: string,
): Promise<{ sellerName: string; sellerId: string; env: "production" | "sandbox" }> => {
  const account = await getCredential(alias);
  if (!account) throw authError();
  const token = await fetchAccessToken(alias, true);

  const detailRes = await fetch(`${baseUrlForEnv(account.env)}/v3/token/detail`, {
    method: "GET",
    headers: {
      "WM_SEC.ACCESS_TOKEN": token,
      "WM_QOS.CORRELATION_ID": newCorrelationId(),
      "WM_SVC.NAME": "Walmart Marketplace",
      Accept: "application/json",
    },
  });

  if (!detailRes.ok) throw authError();
  const detail = (await detailRes.json()) as { sellerName?: string; sellerId?: string };

  return {
    sellerName: detail.sellerName ?? account.sellerName,
    sellerId: detail.sellerId ?? account.sellerId,
    env: account.env,
  };
};
