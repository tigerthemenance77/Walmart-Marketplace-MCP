import { requestJson } from "./client.js";

export const getLagtime = (alias: string, sku: string) =>
  requestJson({ alias, method: "GET", path: "/v3/lagtime", query: { sku } });
