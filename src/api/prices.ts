import { requestJson } from "./client.js";

export const getPromoPrice = (alias: string, sku: string) =>
  requestJson({ alias, method: "GET", path: `/v3/promo/sku/${encodeURIComponent(sku)}` });

export const updatePrice = (alias: string, payload: { sku: string; currency: string; price: number; promo?: unknown }) =>
  requestJson({ alias, method: "PUT", path: "/v3/price", body: payload });
