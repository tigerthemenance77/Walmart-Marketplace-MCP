import { requestJson } from "./client.js";

export const getItems = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/items", query: params as Record<string, string | number | undefined> });

export const getItem = (alias: string, id: string) =>
  requestJson({ alias, method: "GET", path: `/v3/items/${encodeURIComponent(id)}` });

export const retireItem = (alias: string, sku: string) =>
  requestJson({ alias, method: "DELETE", path: `/v3/items/${encodeURIComponent(sku)}` });
