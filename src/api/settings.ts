import { requestJson } from "./client.js";

export const getCarriers = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/settings/shipping/carriers" });
export const getFulfillmentCenters = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/settings/shipping/shipnodes/coverage" });
export const createFulfillmentCenter = (alias: string, payload: unknown) => requestJson({ alias, method: "POST", path: "/v3/settings/shipping/shipnodes", body: payload });
export const updateFulfillmentCenter = (alias: string, payload: unknown) => requestJson({ alias, method: "PUT", path: "/v3/settings/shipping/shipnodes", body: payload });
export const create3plNode = (alias: string, payload: unknown) => requestJson({ alias, method: "POST", path: "/v3/settings/shipping/3plshipnodes", body: payload });
export const get3plProviders = (alias: string) => requestJson({ alias, method: "GET", path: "/v3/settings/shipping/3plproviders" });
