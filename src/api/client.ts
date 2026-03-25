import { buildWalmartHeaders } from "../auth/headers.js";
import { with401Retry, baseUrlForEnv } from "../auth/oauth.js";
import { getCredential } from "../credentials/manager.js";
import { rateLimiter } from "../utils/rate-limiter.js";

export interface RequestOptions {
  alias: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

const toUrl = (base: string, path: string, query?: Record<string, string | number | undefined>): string => {
  const url = new URL(path, base);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
};

export const requestJson = async <T>(options: RequestOptions): Promise<{ data: T; warning?: string; status: number }> => {
  const account = await getCredential(options.alias);
  if (!account) throw new Error("Account not found");

  const limit = rateLimiter.check(options.method, options.path);
  if (!limit.allowed) {
    throw new Error(`${limit.error}. Retry after ${limit.retryAfterMs}ms`);
  }

  const url = toUrl(baseUrlForEnv(account.env), options.path, options.query);
  return with401Retry(options.alias, async (token) => {
    const res = await fetch(url, {
      method: options.method,
      headers: buildWalmartHeaders(token),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) throw new Error("401 Unauthorized");
    const text = await res.text();
    const data = text.length ? (JSON.parse(text) as T) : ({} as T);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return { data, warning: limit.warning, status: res.status };
  });
};
