import { requestJson } from "./client.js";

export const getInventory = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/inventory", query: params as Record<string, string | number | undefined> });

export const updateInventory = (alias: string, sku: string, quantity: number, shipNodeId: string) =>
  requestJson({ alias, method: "PUT", path: `/v3/inventory/${encodeURIComponent(sku)}`, body: { sku, quantity: { unit: "EACH", amount: quantity }, shipNode: { shipNodeId } } });
