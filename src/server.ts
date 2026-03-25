import { z } from "zod";
import { allAccounts, accountBanner, getActiveAccount, requireActiveAccount, setActiveAccount, switchActiveAccount, saveAccount } from "./accounts/manager.js";
import { getCredential } from "./credentials/manager.js";
import { verifyAccountCredentials } from "./auth/oauth.js";
import { getItems, getItem, retireItem } from "./api/items.js";
import { getOrders, getOrder, getReleasedOrders, acknowledgeOrder, shipOrder } from "./api/orders.js";
import { getInventory, updateInventory } from "./api/inventory.js";
import { getPromoPrice, updatePrice } from "./api/prices.js";
import { bulkUpdateInventory, bulkUpdatePrices, feedSeverity, getDailyFeedUsage, getFeedItemStatus, listFeeds, submitFeed } from "./api/feeds.js";
import { getReturns, issueRefund } from "./api/returns.js";
import { createExceptions, createRule, deleteRule, downloadExceptions, getAreas, getRule, getRules, getSubcategories, inactivateRule, updateRule } from "./api/rules.js";
import { create3plNode, createFulfillmentCenter, get3plProviders, getCarriers, getFulfillmentCenters, updateFulfillmentCenter } from "./api/settings.js";
import { getLagtime } from "./api/lagtime.js";
import { previewAcknowledgeOrder, previewDeleteRule, previewInventory, previewIssueRefund, previewPrice, previewRetireItem, previewShipOrder } from "./safety/dry-run.js";
import { writeAuditEntry } from "./safety/audit-log.js";
import { rateLimiter } from "./utils/rate-limiter.js";
import { dangerResponse, Severity, warnResponse } from "./safety/severity.js";
import { isoDateSchema, priceSchema, purchaseOrderIdSchema, quantitySchema, skuSchema } from "./utils/validation.js";

const withAccount = <T>(data: T, warning?: string): { data: T; account: string; warning?: string } => ({
  data,
  account: accountBanner(),
  ...(warning ? { warning } : {}),
});

type ToolHandler = (params: unknown) => Promise<unknown>;

const activeAlias = (): string => requireActiveAccount().alias;
const makeAuditId = (tool: string, ref: string): string => `audit_${new Date().toISOString()}_${tool}_${ref}`;

const registerTool = (name: string, fn: ToolHandler): [string, ToolHandler] => [name, fn];
const registerPrompt = (_name: string, _config: unknown, _cb: () => unknown): void => {};

const tools: Record<string, ToolHandler> = Object.fromEntries([
  registerTool("list_accounts", async () => ({ accounts: await allAccounts() })),
  registerTool("get_active_account", async () => ({ active: getActiveAccount() ?? "none set" })),
  registerTool("set_account", async (params) => {
    const input = z.object({ alias: z.string() }).strict().parse(params);
    const ctx = await setActiveAccount(input.alias);
    return { active: ctx, account: accountBanner() };
  }),
  registerTool("switch_account", async (params) => {
    const input = z.object({ alias: z.string() }).strict().parse(params);
    const out = await switchActiveAccount(input.alias);
    return { message: out.message, account: accountBanner() };
  }),
  registerTool("refresh_account_info", async () => {
    const ctx = requireActiveAccount();
    const existing = await getCredential(ctx.alias);
    if (!existing) throw new Error("Account not found");
    const detail = await verifyAccountCredentials(ctx.alias);
    await saveAccount({ ...existing, sellerId: detail.sellerId, sellerName: detail.sellerName });
    return withAccount({ sellerName: detail.sellerName, sellerId: detail.sellerId });
  }),
  registerTool("get_rate_limits", async () => withAccount({ limits: rateLimiter.snapshot() })),

  registerTool("get_items", async (params) => {
    const input = z.object({ nextCursor: z.string().optional(), sku: z.string().optional(), lifecycleStatus: z.string().optional(), publishedStatus: z.string().optional(), limit: z.number().optional() }).strict().parse(params ?? {});
    const out = await getItems(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_item", async (params) => {
    const input = z.object({ id: z.string() }).strict().parse(params);
    const out = await getItem(activeAlias(), input.id);
    return withAccount(out.data, out.warning);
  }),
  registerTool("retire_item", async (params) => {
    const input = z.object({ sku: skuSchema, dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewRetireItem(input.sku));
    const out = await retireItem(activeAlias(), input.sku);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("retire_item", input.sku);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "retire_item", params: { sku: input.sku, dry_run: false }, httpMethod: "DELETE", httpPath: `/v3/items/${input.sku}`, httpStatus: out.status, success: true, responseSummary: "Item retired" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),

  registerTool("get_orders", async (params) => {
    const input = z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), status: z.string().optional(), shipNodeType: z.string().optional(), limit: z.number().optional() }).strict().parse(params);
    const out = await getOrders(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_order", async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema }).strict().parse(params);
    const out = await getOrder(activeAlias(), input.purchaseOrderId);
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_released_orders", async (params) => {
    const input = z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), limit: z.number().optional() }).strict().parse(params);
    const out = await getReleasedOrders(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("acknowledge_order", async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema, dry_run: z.boolean().default(true) }).strict().parse(params);
    const order = await getOrder(activeAlias(), input.purchaseOrderId);
    if (input.dry_run) return withAccount(previewAcknowledgeOrder(input.purchaseOrderId, order.data as Record<string, unknown>));

    const out = await acknowledgeOrder(activeAlias(), input.purchaseOrderId);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("acknowledge_order", input.purchaseOrderId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "acknowledge_order", params: { purchaseOrderId: input.purchaseOrderId, dry_run: false }, httpMethod: "POST", httpPath: `/v3/orders/${input.purchaseOrderId}/acknowledge`, httpStatus: out.status, success: true, responseSummary: "Order acknowledged" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),
  registerTool("ship_order", async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema, orderLines: z.array(z.object({ lineNumber: z.string(), carrierName: z.string(), trackingNumber: z.string() }).passthrough()), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewShipOrder(input.purchaseOrderId, input.orderLines));

    const out = await shipOrder(activeAlias(), input.purchaseOrderId, input.orderLines);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("ship_order", input.purchaseOrderId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "ship_order", params: { purchaseOrderId: input.purchaseOrderId, orderLines: input.orderLines, dry_run: false }, httpMethod: "POST", httpPath: `/v3/orders/${input.purchaseOrderId}/shipping`, httpStatus: out.status, success: true, responseSummary: "Shipping confirmation submitted" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),

  registerTool("get_inventory", async (params) => {
    const input = z.object({ sku: z.string().optional(), source: z.string().optional() }).strict().parse(params ?? {});
    const out = await getInventory(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("update_inventory", async (params) => {
    const input = z.object({ sku: skuSchema, quantity: quantitySchema, shipNodeId: z.string(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const current = await getInventory(activeAlias(), { sku: input.sku });
    const currentQuantity = Number((current.data as { quantity?: { amount?: number } })?.quantity?.amount ?? 0);

    if (input.dry_run) return withAccount(previewInventory(input.sku, currentQuantity, input.quantity, input.shipNodeId), current.warning);

    const out = await updateInventory(activeAlias(), input.sku, input.quantity, input.shipNodeId);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("update_inventory", input.sku);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "update_inventory", params: { sku: input.sku, quantity: input.quantity, shipNodeId: input.shipNodeId, dry_run: false }, httpMethod: "PUT", httpPath: `/v3/inventory/${input.sku}`, httpStatus: out.status, success: true, responseSummary: "Inventory updated" });
    return withAccount({ executed: true, auditId }, out.warning || current.warning);
  }),
  registerTool("bulk_update_inventory", async (params) => {
    const input = z.object({ feedPayload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(dangerResponse("bulk_update_inventory", "🚨 DANGER — Bulk inventory updates can impact many listings at once.", { feedType: "inventory" }, "Call again with dry_run=false to submit this bulk inventory feed."));
    const out = await bulkUpdateInventory(activeAlias(), input.feedPayload);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("bulk_update_inventory", "inventory");
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "bulk_update_inventory", params: { dry_run: false }, httpMethod: "POST", httpPath: "/v3/feeds?feedType=inventory", httpStatus: out.status, success: true, responseSummary: "Inventory bulk feed submitted" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),

  registerTool("get_promo_price", async (params) => {
    const input = z.object({ sku: skuSchema }).strict().parse(params);
    const out = await getPromoPrice(activeAlias(), input.sku);
    return withAccount(out.data, out.warning);
  }),
  registerTool("update_price", async (params) => {
    const input = z.object({ sku: skuSchema, currency: z.string().min(3).max(3), price: priceSchema, promo: z.unknown().optional(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const current = await getPromoPrice(activeAlias(), input.sku);
    const currentPrice = Number((current.data as { price?: { amount?: number } })?.price?.amount ?? 0);

    if (input.dry_run) return withAccount(previewPrice(input.sku, currentPrice, input.price), current.warning);

    const out = await updatePrice(activeAlias(), { sku: input.sku, currency: input.currency, price: input.price, promo: input.promo });
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("update_price", input.sku);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "update_price", params: { sku: input.sku, currency: input.currency, price: input.price, promo: input.promo, dry_run: false }, httpMethod: "PUT", httpPath: "/v3/price", httpStatus: out.status, success: true, responseSummary: "Price updated" });
    return withAccount({ executed: true, auditId }, out.warning || current.warning);
  }),
  registerTool("bulk_update_prices", async (params) => {
    const input = z.object({ feedPayload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const usage = await getDailyFeedUsage("PRICE_AND_PROMOTION");
    if (input.dry_run) {
      return withAccount(dangerResponse("submit_feed", `🚨 DANGER — This uses 1 of your 6 daily PRICE_AND_PROMOTION slots. You have used ${usage.used} of 6 today. This slot CANNOT be recovered.`, { feedType: "PRICE_AND_PROMOTION", dailyUsed: usage.used, dailyRemaining: usage.remaining, dailyLimit: usage.limit }, "Call again with dry_run=false to submit this feed."));
    }
    const out = await bulkUpdatePrices(activeAlias(), input.feedPayload);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("bulk_update_prices", "PRICE_AND_PROMOTION");
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "bulk_update_prices", params: { dry_run: false }, httpMethod: "POST", httpPath: "/v3/feeds?feedType=PRICE_AND_PROMOTION", httpStatus: out.status, success: true, responseSummary: "Price bulk feed submitted" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),

  registerTool("submit_feed", async (params) => {
    const input = z.object({ feedType: z.string(), feedPayload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const severity = feedSeverity(input.feedType);
    if (severity === Severity.DANGER && ["PRICE_AND_PROMOTION", "promo", "lagtime", "WALMART_FUNDED_INCENTIVES_ENROLLMENT"].includes(input.feedType)) {
      const usage = await getDailyFeedUsage(input.feedType);
      if (input.dry_run) return withAccount(dangerResponse("submit_feed", `🚨 DANGER — This uses 1 of your 6 daily ${input.feedType} slots. You have used ${usage.used} of 6 today. This slot CANNOT be recovered.`, { feedType: input.feedType, dailyUsed: usage.used, dailyRemaining: usage.remaining, dailyLimit: usage.limit }, "Call again with dry_run=false to submit this feed."));
    }
    if (input.dry_run) {
      const preview = severity === Severity.DANGER
        ? dangerResponse("submit_feed", `🚨 DANGER — Feed type ${input.feedType} may be irreversible or tightly rate-limited.`, { feedType: input.feedType }, "Call again with dry_run=false to submit this feed.")
        : warnResponse("submit_feed", { feedType: input.feedType }, "Call again with dry_run=false to submit this feed.");
      return withAccount(preview);
    }
    const out = await submitFeed(activeAlias(), input.feedType, input.feedPayload);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("submit_feed", input.feedType);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "submit_feed", params: { feedType: input.feedType, dry_run: false }, httpMethod: "POST", httpPath: `/v3/feeds?feedType=${input.feedType}`, httpStatus: out.status, success: true, responseSummary: "Feed submitted" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),
  registerTool("get_feed_item_status", async (params) => {
    const input = z.object({ feedId: z.string() }).strict().parse(params);
    const out = await getFeedItemStatus(activeAlias(), input.feedId);
    return withAccount(out.data, out.warning);
  }),
  registerTool("list_feeds", async (params) => {
    const input = z.object({ feedType: z.string().optional(), offset: z.number().optional(), limit: z.number().optional() }).strict().parse(params ?? {});
    const out = await listFeeds(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),

  registerTool("get_returns", async (params) => {
    const input = z.object({ nextCursor: z.string().optional(), returnCreationStartDate: isoDateSchema.optional(), returnCreationEndDate: isoDateSchema.optional(), status: z.string().optional() }).strict().parse(params ?? {});
    const out = await getReturns(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("issue_refund", async (params) => {
    const input = z.object({ returnOrderId: z.string(), refundLines: z.array(z.unknown()).default([]), totalRefund: z.number(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewIssueRefund(input.returnOrderId, input.refundLines, input.totalRefund));
    const out = await issueRefund(activeAlias(), input.returnOrderId, { refundLines: input.refundLines, totalRefund: input.totalRefund });
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("issue_refund", input.returnOrderId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "issue_refund", params: { returnOrderId: input.returnOrderId, totalRefund: input.totalRefund, dry_run: false }, httpMethod: "POST", httpPath: `/v3/returns/${input.returnOrderId}/refund`, httpStatus: out.status, success: true, responseSummary: "Refund issued" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),

  registerTool("get_rules", async () => {
    const out = await getRules(activeAlias());
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_rule", async (params) => {
    const input = z.object({ ruleId: z.string(), ruleStatus: z.string() }).strict().parse(params);
    const out = await getRule(activeAlias(), input.ruleId, input.ruleStatus);
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_subcategories", async () => {
    const out = await getSubcategories(activeAlias());
    return withAccount(out.data, out.warning);
  }),
  registerTool("get_areas", async () => {
    const out = await getAreas(activeAlias());
    return withAccount(out.data, out.warning);
  }),
  registerTool("download_exceptions", async () => {
    const out = await downloadExceptions(activeAlias());
    return withAccount(out.data, out.warning);
  }),
  registerTool("create_rule", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("create_rule", { operation: "CREATE" }, "Call again with dry_run=false to create this rule."));
    const out = await createRule(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("update_rule", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("update_rule", { operation: "UPDATE" }, "Call again with dry_run=false to update this rule."));
    const out = await updateRule(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("delete_rule", async (params) => {
    const input = z.object({ ruleId: z.string(), ruleStatus: z.string(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewDeleteRule(input.ruleId));
    const out = await deleteRule(activeAlias(), input.ruleId, input.ruleStatus);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("delete_rule", input.ruleId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "delete_rule", params: { ruleId: input.ruleId, ruleStatus: input.ruleStatus, dry_run: false }, httpMethod: "DELETE", httpPath: `/v3/rules/${input.ruleId}/status/${input.ruleStatus}`, httpStatus: out.status, success: true, responseSummary: "Rule deleted" });
    return withAccount({ executed: true, auditId }, out.warning);
  }),
  registerTool("inactivate_rule", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("inactivate_rule", { operation: "INACTIVATE" }, "Call again with dry_run=false to inactivate this rule."));
    const out = await inactivateRule(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("create_exceptions", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("create_exceptions", { operation: "CREATE" }, "Call again with dry_run=false to create exceptions."));
    const out = await createExceptions(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),

  registerTool("get_carriers", async () => withAccount((await getCarriers(activeAlias())).data)),
  registerTool("get_fulfillment_centers", async () => withAccount((await getFulfillmentCenters(activeAlias())).data)),
  registerTool("create_fulfillment_center", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("create_fulfillment_center", { operation: "CREATE" }, "Call again with dry_run=false to create this fulfillment center."));
    const out = await createFulfillmentCenter(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("update_fulfillment_center", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("update_fulfillment_center", { operation: "UPDATE" }, "Call again with dry_run=false to update this fulfillment center."));
    const out = await updateFulfillmentCenter(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("create_3pl_node", async (params) => {
    const input = z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(warnResponse("create_3pl_node", { operation: "CREATE" }, "Call again with dry_run=false to create this 3PL node."));
    const out = await create3plNode(activeAlias(), input.payload);
    return withAccount({ executed: true }, out.warning);
  }),
  registerTool("get_3pl_providers", async () => withAccount((await get3plProviders(activeAlias())).data)),

  registerTool("get_lagtime", async (params) => {
    const input = z.object({ sku: skuSchema }).strict().parse(params);
    const out = await getLagtime(activeAlias(), input.sku);
    const note = out.warning ? `${out.warning} | Endpoint limit: 20/hour` : "Endpoint limit: 20/hour";
    return withAccount(out.data, note);
  }),

]);

registerPrompt("onboarding", { description: "Guided setup for Walmart Marketplace MCP" }, () => ({
  messages: [{ role: "user", content: { type: "text", text: `Welcome to Walmart Marketplace MCP! Here's your setup guide:\n\nSTEP 1: Install CLI and add credentials\n  npx walmart-marketplace-mcp init\n  Follow the prompts for alias, Client ID, Client Secret, and environment.\n\nSTEP 2: Verify credentials\n  npx walmart-marketplace-mcp accounts verify <alias>\n  Should show: ✓ Connected as: [Seller Name] (Seller ID: [id])\n\nSTEP 3: Set active account in Claude\n  Call: set_account (alias: "<your-alias>")\n  Response will confirm the active account.\n\nSTEP 4: Run a test query\n  Call: get_orders (createdStartDate: "2026-03-25")\n  You should see your order list with the 📍 Account header.\n\nSTEP 5: Try a safe write (preview only)\n  Call: update_price (sku: "<your-sku>", currency: "USD", price: 19.99, dry_run: true)\n  This shows a preview — no changes are made. Pass dry_run=false to apply.\n\n⚠️ Write Safety: All write tools default to dry_run=true (preview mode). You must explicitly pass dry_run=false to execute any mutation.\n\n🚨 Rate Limits: Use get_rate_limits to check current usage. PRICE_AND_PROMOTION feeds are limited to 6/day — the server tracks and enforces this.` } }],
}));

export const handleTool = async (method: string, params: unknown): Promise<unknown> => {
  const fn = tools[method];
  if (!fn) throw new Error(`Unknown method: ${method}`);

  const accountFree = new Set(["list_accounts", "get_active_account", "set_account", "switch_account"]);
  if (!accountFree.has(method)) requireActiveAccount();

  return fn(params);
};

export const toolNames = Object.keys(tools);
