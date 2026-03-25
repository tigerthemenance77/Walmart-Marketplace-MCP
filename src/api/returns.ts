import { requestJson } from "./client.js";

export const getReturns = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/returns", query: params as Record<string, string | number | undefined> });

export const issueRefund = (alias: string, returnOrderId: string, payload: unknown) =>
  requestJson({ alias, method: "POST", path: `/v3/returns/${encodeURIComponent(returnOrderId)}/refund`, body: payload });
