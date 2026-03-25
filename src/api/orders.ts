import { requestJson } from "./client.js";

export const getOrders = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/orders", query: params as Record<string, string | number | undefined> });

export const getOrder = (alias: string, purchaseOrderId: string) =>
  requestJson({ alias, method: "GET", path: `/v3/orders/${encodeURIComponent(purchaseOrderId)}` });

export const getReleasedOrders = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/orders/released", query: params as Record<string, string | number | undefined> });

export const acknowledgeOrder = (alias: string, purchaseOrderId: string) =>
  requestJson({ alias, method: "POST", path: `/v3/orders/${encodeURIComponent(purchaseOrderId)}/acknowledge`, body: {} });

export const shipOrder = (alias: string, purchaseOrderId: string, orderLines: unknown[]) =>
  requestJson({ alias, method: "POST", path: `/v3/orders/${encodeURIComponent(purchaseOrderId)}/shipping`, body: { orderLines } });
