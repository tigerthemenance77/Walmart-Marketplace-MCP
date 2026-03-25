import { requestJson } from "./client.js";

export const getRules = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/rules" });
export const getRule = (alias: string, ruleId: string, ruleStatus: string) =>
  requestJson({ alias, method: "GET", path: `/v3/rules/${encodeURIComponent(ruleId)}/status/${encodeURIComponent(ruleStatus)}` });
export const getSubcategories = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/rules/subcategories" });
export const getAreas = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/rules/areas" });
export const downloadExceptions = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/rules/downloadexceptions" });
export const createRule = (alias: string, payload: unknown) => requestJson({ alias, method: "POST", path: "/v3/rules/create", body: payload });
export const updateRule = (alias: string, payload: unknown) => requestJson({ alias, method: "PUT", path: "/v3/rules/actions", body: payload });
export const deleteRule = (alias: string, ruleId: string, ruleStatus: string) =>
  requestJson({ alias, method: "DELETE", path: `/v3/rules/${encodeURIComponent(ruleId)}/status/${encodeURIComponent(ruleStatus)}` });
export const inactivateRule = (alias: string, payload: unknown) => requestJson({ alias, method: "PUT", path: "/v3/rules/inactivate", body: payload });
export const createExceptions = (alias: string, payload: unknown) => requestJson({ alias, method: "POST", path: "/v3/rules/exceptions", body: payload });
