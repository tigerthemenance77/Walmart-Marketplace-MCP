import { newCorrelationId } from "../utils/correlation-id.js";

export const buildWalmartHeaders = (accessToken: string): Record<string, string> => ({
  "WM_SEC.ACCESS_TOKEN": accessToken,
  "WM_QOS.CORRELATION_ID": newCorrelationId(),
  "WM_SVC.NAME": "Walmart Marketplace",
  Accept: "application/json",
  "Content-Type": "application/json",
});
