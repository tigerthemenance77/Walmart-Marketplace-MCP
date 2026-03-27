import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { allAccounts, accountBanner, getActiveAccount, requireActiveAccount, setActiveAccount, switchActiveAccount, saveAccount } from "./accounts/manager.js";
import type { SellerAccount } from "./accounts/types.js";
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

type PublicAccount = Pick<SellerAccount, "alias" | "sellerName" | "sellerId" | "env" | "addedAt">;

const toPublicAccount = (a: SellerAccount): PublicAccount => ({
  alias: a.alias,
  sellerName: a.sellerName,
  sellerId: a.sellerId,
  env: a.env,
  addedAt: a.addedAt,
});

const listPublicAccounts = async (): Promise<PublicAccount[]> =>
  (await allAccounts()).map(toPublicAccount);

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
const registerResource = (_name: string, _uri: string, _config: unknown, _cb: () => unknown): void => {};

const tools: Record<string, ToolHandler> = Object.fromEntries([
  registerTool("list_accounts", async () => ({ accounts: await listPublicAccounts() })),
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
    if (input.dry_run) return withAccount(previewAcknowledgeOrder(input.purchaseOrderId, {}));

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
    if (input.dry_run) return withAccount(previewInventory(input.sku, 0, input.quantity, input.shipNodeId));

    const current = await getInventory(activeAlias(), { sku: input.sku });
    const currentQuantity = Number((current.data as { quantity?: { amount?: number } })?.quantity?.amount ?? 0);
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
    const input = z.object({ sku: skuSchema, currency: z.string().length(3).default("USD"), price: priceSchema, promo: z.unknown().optional(), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewPrice(input.sku, 0, input.price, input.currency));

    const current = await getPromoPrice(activeAlias(), input.sku);
    const currentPrice = Number((current.data as { price?: { amount?: number } })?.price?.amount ?? 0);
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
  registerTool("get_daily_feed_usage", async (params) => {
    const input = z.object({ feedType: z.string().optional() }).strict().parse(params ?? {});
    const usage = await getDailyFeedUsage(input.feedType ?? "PRICE_AND_PROMOTION");
    return withAccount({ feedType: input.feedType ?? "PRICE_AND_PROMOTION", ...usage });
  }),

  registerTool("get_returns", async (params) => {
    const input = z.object({ nextCursor: z.string().optional(), returnCreationStartDate: isoDateSchema.optional(), returnCreationEndDate: isoDateSchema.optional(), status: z.string().optional() }).strict().parse(params ?? {});
    const out = await getReturns(activeAlias(), input);
    return withAccount(out.data, out.warning);
  }),
  registerTool("issue_refund", async (params) => {
    const raw = z.object({
      returnOrderId: z.string().optional(),
      totalRefund: z.number().optional(),
      refundLines: z.array(z.unknown()).default([]),
      purchaseOrderId: z.string().optional(),
      refundAmount: z.number().optional(),
      orderLineNumber: z.string().optional(),
      refundReason: z.string().optional(),
      dry_run: z.boolean().default(true),
    }).strict().parse(params);

    const normalized = {
      returnOrderId: raw.returnOrderId ?? raw.purchaseOrderId,
      totalRefund: raw.totalRefund ?? raw.refundAmount,
      refundLines: raw.refundLines,
      dry_run: raw.dry_run,
    };

    const input = z.object({ returnOrderId: z.string(), totalRefund: z.number(), refundLines: z.array(z.unknown()), dry_run: z.boolean() }).parse(normalized);

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
  registerTool("get_api_docs", async () => ({ mimeType: "text/plain", text: API_DOCS })),
  registerTool("get_account_list_resource", async () => ({ mimeType: "application/json", accounts: await listPublicAccounts() })),

]);

registerPrompt("onboarding", { description: "Guided setup for Walmart Marketplace MCP" }, () => ({
  messages: [{ role: "user", content: { type: "text", text: `Welcome to Walmart Marketplace MCP! Here's your setup guide:\n\nSTEP 1: Install CLI and add credentials\n  npx walmart-marketplace-mcp init\n  Follow the prompts for alias, Client ID, Client Secret, and environment.\n\nSTEP 2: Verify credentials\n  npx walmart-marketplace-mcp accounts verify <alias>\n  Should show: ✓ Connected as: [Seller Name] (Seller ID: [id])\n\nSTEP 3: Set active account in Claude\n  Call: set_account (alias: "<your-alias>")\n  Response will confirm the active account.\n\nSTEP 4: Run a test query\n  Call: get_orders (createdStartDate: "2026-03-25")\n  You should see your order list with the 📍 Account header.\n\nSTEP 5: Try a safe write (preview only)\n  Call: update_price (sku: "<your-sku>", currency: "USD", price: 19.99, dry_run: true)\n  This shows a preview — no changes are made. Pass dry_run=false to apply.\n\n⚠️ Write Safety: All write tools default to dry_run=true (preview mode). You must explicitly pass dry_run=false to execute any mutation.\n\n🚨 Rate Limits: Use get_rate_limits to check current usage. PRICE_AND_PROMOTION feeds are limited to 6/day — the server tracks and enforces this.` } }],
}));

registerResource("api-docs", "walmart-marketplace://api-docs", { description: "Tool reference catalog" }, () => ({
  contents: [{ uri: "walmart-marketplace://api-docs", mimeType: "text/plain", text: API_DOCS }],
}));

registerResource("account-list", "walmart-marketplace://account-list", { description: "Configured accounts" }, async () => ({
  contents: [{ uri: "walmart-marketplace://account-list", mimeType: "application/json", text: JSON.stringify(await allAccounts(), null, 2) }],
}));

const API_DOCS = `walmart-marketplace://api-docs — Tool Reference
================================================

ACCOUNT MANAGEMENT
  list_accounts          READ   — List all configured seller accounts
  get_active_account     READ   — Show currently pinned account
  set_account            LOCAL  — Pin an account by alias
  switch_account         LOCAL  — Switch to a different account
  refresh_account_info   READ   — Refresh seller identity from API
  get_rate_limits        LOCAL  — Show rate limit usage dashboard

ITEMS
  get_items              READ   — List items in catalog
  get_item               READ   — Get item details by SKU or ID
  retire_item            DANGER — Remove item from Walmart.com (irreversible)

ORDERS
  get_orders             READ   — List orders with filters
  get_order              READ   — Get single order details
  get_released_orders    READ   — Get orders ready for fulfillment
  acknowledge_order      WARN   — Acknowledge receipt of order (dry_run default)
  ship_order             WARN   — Submit shipping confirmation (dry_run default)

INVENTORY
  get_inventory          READ   — Check inventory levels by SKU
  update_inventory       WARN   — Update single SKU quantity (dry_run default)
  bulk_update_inventory  DANGER — Bulk inventory update via feed (dry_run default)

PRICES
  get_promo_price        READ   — Get current price and promotion
  update_price           WARN   — Update single item price (dry_run default)
  bulk_update_prices     DANGER — Bulk price update via feed, 6/day limit (dry_run default)

FEEDS
  submit_feed            WARN/DANGER — Submit bulk feed (severity depends on feedType)
  get_feed_item_status   READ   — Get feed status with item-level detail
  list_feeds             READ   — List recent feeds
  get_daily_feed_usage   READ   — Get daily feed usage (used/remaining/limit) for a feed type

RETURNS
  get_returns            READ   — List return orders
  issue_refund           DANGER — Issue refund for return (irreversible, dry_run default)

RULES
  get_rules              READ   — List shipping/assortment rules
  get_rule               READ   — Get single rule details
  get_subcategories      READ   — Get rule subcategory options
  get_areas              READ   — Get shipping area options
  download_exceptions    READ   — Download rule exception file
  create_rule            WARN   — Create new rule (dry_run default)
  update_rule            WARN   — Update existing rule (dry_run default)
  delete_rule            DANGER — Delete rule (dry_run default)
  inactivate_rule        WARN   — Inactivate rule (dry_run default)
  create_exceptions      WARN   — Create rule exceptions (dry_run default)

SETTINGS
  get_carriers           READ   — List available shipping carriers
  get_fulfillment_centers READ  — List fulfillment center coverage
  create_fulfillment_center WARN — Add new fulfillment center (dry_run default)
  update_fulfillment_center WARN — Update fulfillment center (dry_run default)
  create_3pl_node        WARN   — Add 3PL ship node (dry_run default)
  get_3pl_providers      READ   — List 3PL provider options

LAGTIME
  get_lagtime            READ   — Get fulfillment lag time for SKU (20/hour limit)

Severity: READ (safe) | WARN (write, reversible) | DANGER (write, irreversible or rate-limited)
All WARN/DANGER tools default to dry_run=true — pass dry_run=false to execute.`;

export const handleTool = async (method: string, params: unknown): Promise<unknown> => {
  const fn = tools[method];
  if (!fn) throw new Error(`Unknown method: ${method}`);

  const accountFree = new Set(["list_accounts", "get_active_account", "set_account", "switch_account", "walmart-marketplace://api-docs", "walmart-marketplace://account-list"]);
  if (!accountFree.has(method)) requireActiveAccount();

  return fn(params);
};

export const toolNames = Object.keys(tools);

const ONBOARDING_TEXT = `Welcome to Walmart Marketplace MCP! Here's your setup guide:

STEP 1: Install CLI and add credentials
  npx walmart-marketplace-mcp init
  Follow the prompts for alias, Client ID, Client Secret, and environment.

STEP 2: Verify credentials
  npx walmart-marketplace-mcp accounts verify <alias>
  Should show: ✓ Connected as: [Seller Name] (Seller ID: [id])

STEP 3: Set active account in Claude
  Call: set_account with your alias
  Response will confirm the active account.

STEP 4: Run a test query
  Call: get_orders with createdStartDate
  You should see your order list with the 📍 Account header.

STEP 5: Try a safe write (preview only)
  Call: update_price with sku, currency, price (dry_run defaults to true)
  This shows a preview — no changes are made. Pass dry_run=false to apply.

⚠️ Write Safety: All write tools default to dry_run=true (preview mode).
🚨 Rate Limits: Use get_rate_limits. PRICE_AND_PROMOTION feeds are limited to 6/day.`;

const toText = (data: unknown): string =>
  typeof data === "string" ? data : JSON.stringify(data, null, 2);

/** Register all tools with the MCP SDK server instance (typed schemas for Claude). */
export function registerTools(server: McpServer): void {
  const success = (result: unknown) => ({ content: [{ type: "text" as const, text: toText(result) }] });
  const failure = (err: unknown) => ({
    content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
    isError: true as const,
  });
  const runTool = async (method: string, params: unknown) => {
    try {
      const result = await handleTool(method, params);
      return success(result);
    } catch (err) {
      return failure(err);
    }
  };

  // ── Account management ──────────────────────────────────────────────────────
  server.registerTool("list_accounts", { annotations: { readOnlyHint: true }, description: "List all configured seller accounts from keychain" },
    async () => {
      try {
        return success({ accounts: await listPublicAccounts() });
      } catch (err) {
        return failure(err);
      }
    });

  server.registerTool("get_active_account", { annotations: { readOnlyHint: true }, description: "Return the currently pinned seller account, or 'none set' if no account is selected" },
    async () => {
      try {
        return success({ active: getActiveAccount() ?? "none set" });
      } catch (err) {
        return failure(err);
      }
    });

  server.registerTool("set_account", {
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: "Pin a seller account by alias. Required before any data or write tool.",
    inputSchema: z.object({ alias: z.string().min(1) })
  }, async ({ alias }) => {
    try {
      const ctx = await setActiveAccount(alias);
      return success({ active: ctx, account: accountBanner() });
    } catch (err) {
      return failure(err);
    }
  });

  server.registerTool("switch_account", {
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: "Switch to a different seller account. Confirms switch before proceeding.",
    inputSchema: z.object({ alias: z.string().min(1) })
  }, async ({ alias }) => {
    try {
      const out = await switchActiveAccount(alias);
      return success({ message: out.message, account: accountBanner() });
    } catch (err) {
      return failure(err);
    }
  });

  server.registerTool("refresh_account_info", { annotations: { readOnlyHint: true }, description: "Re-fetch seller identity from Walmart API and update local cache" },
    async () => runTool("refresh_account_info", {}));

  server.registerTool("get_rate_limits", { annotations: { readOnlyHint: true }, description: "Show current rate limit usage for all tracked endpoints" },
    async () => runTool("get_rate_limits", {}));

  // ── Items ───────────────────────────────────────────────────────────────────
  server.registerTool("get_items", {
    annotations: { readOnlyHint: true },
    description: "List items in the seller catalog with optional filters",
    inputSchema: z.object({ nextCursor: z.string().optional(), sku: z.string().optional(), lifecycleStatus: z.string().optional(), publishedStatus: z.string().optional(), limit: z.number().optional() })
  }, async (input) => runTool("get_items", input));

  server.registerTool("get_item", {
    annotations: { readOnlyHint: true },
    description: "Get full item details by SKU or Walmart item ID",
    inputSchema: z.object({ id: z.string() })
  }, async ({ id }) => runTool("get_item", { id }));

  server.registerTool("retire_item", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Remove an item from Walmart.com (DANGER — irreversible). Defaults to dry_run=true for preview.",
    inputSchema: z.object({ sku: skuSchema, dry_run: z.boolean().default(true) })
  }, async (input) => runTool("retire_item", input));

  // ── Orders ──────────────────────────────────────────────────────────────────
  server.registerTool("get_orders", {
    annotations: { readOnlyHint: true },
    description: "List orders with filters. createdStartDate is required.",
    inputSchema: z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), status: z.string().optional(), shipNodeType: z.string().optional(), limit: z.number().optional() })
  }, async (input) => runTool("get_orders", input));

  server.registerTool("get_order", {
    annotations: { readOnlyHint: true },
    description: "Get full details for a single order by purchase order ID",
    inputSchema: z.object({ purchaseOrderId: purchaseOrderIdSchema })
  }, async ({ purchaseOrderId }) => runTool("get_order", { purchaseOrderId }));

  server.registerTool("get_released_orders", {
    annotations: { readOnlyHint: true },
    description: "Get orders ready for fulfillment (status: Released)",
    inputSchema: z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), limit: z.number().optional() })
  }, async (input) => runTool("get_released_orders", input));

  server.registerTool("acknowledge_order", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Acknowledge receipt of an order. Defaults to dry_run=true for preview.",
    inputSchema: z.object({ purchaseOrderId: purchaseOrderIdSchema, dry_run: z.boolean().default(true) })
  }, async (input) => runTool("acknowledge_order", input));

  server.registerTool("ship_order", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Submit shipping confirmation with carrier and tracking. Defaults to dry_run=true for preview.",
    inputSchema: z.object({ purchaseOrderId: purchaseOrderIdSchema, orderLines: z.array(z.object({ lineNumber: z.string(), carrierName: z.string(), trackingNumber: z.string() }).passthrough()), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("ship_order", input));

  // ── Inventory ───────────────────────────────────────────────────────────────
  server.registerTool("get_inventory", {
    annotations: { readOnlyHint: true },
    description: "Check inventory levels by SKU across ship nodes",
    inputSchema: z.object({ sku: z.string().optional(), source: z.string().optional() })
  }, async (input) => runTool("get_inventory", input));

  server.registerTool("update_inventory", {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Update inventory quantity for a single SKU at a ship node. Defaults to dry_run=true for preview.",
    inputSchema: z.object({ sku: skuSchema, quantity: quantitySchema, shipNodeId: z.string(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("update_inventory", input));

  server.registerTool("bulk_update_inventory", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Bulk inventory update via feed file (DANGER). Defaults to dry_run=true for preview.",
    inputSchema: z.object({ feedPayload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("bulk_update_inventory", input));

  // ── Prices ──────────────────────────────────────────────────────────────────
  server.registerTool("get_promo_price", {
    annotations: { readOnlyHint: true },
    description: "Get current price and any active promotional pricing for a SKU",
    inputSchema: z.object({ sku: skuSchema })
  }, async ({ sku }) => runTool("get_promo_price", { sku }));

  server.registerTool("update_price", {
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Update price for a single item. Defaults to dry_run=true for preview.",
    inputSchema: z.object({ sku: skuSchema, currency: z.string().length(3).default("USD"), price: priceSchema, promo: z.unknown().optional(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("update_price", input));

  server.registerTool("bulk_update_prices", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Bulk price update via PRICE_AND_PROMOTION feed (DANGER — 6/day limit). Defaults to dry_run=true.",
    inputSchema: z.object({ feedPayload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("bulk_update_prices", input));

  // ── Feeds ───────────────────────────────────────────────────────────────────
  server.registerTool("submit_feed", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Submit a bulk feed file. Severity depends on feedType (DANGER for 6/day feeds). Defaults to dry_run=true.",
    inputSchema: z.object({ feedType: z.string(), feedPayload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("submit_feed", input));

  server.registerTool("get_feed_item_status", {
    annotations: { readOnlyHint: true },
    description: "Get feed processing status and item-level detail by feed ID",
    inputSchema: z.object({ feedId: z.string() })
  }, async ({ feedId }) => runTool("get_feed_item_status", { feedId }));

  server.registerTool("list_feeds", {
    annotations: { readOnlyHint: true },
    description: "List recent feed submissions with optional filters",
    inputSchema: z.object({ feedType: z.string().optional(), offset: z.number().optional(), limit: z.number().optional() })
  }, async (input) => runTool("list_feeds", input));

  server.registerTool("get_daily_feed_usage", {
    annotations: { readOnlyHint: true },
    description: "Get daily feed usage (used/remaining/limit) for a feed type",
    inputSchema: z.object({ feedType: z.string().optional() })
  }, async ({ feedType }) => runTool("get_daily_feed_usage", { feedType }));

  // ── Returns ─────────────────────────────────────────────────────────────────
  server.registerTool("get_returns", {
    annotations: { readOnlyHint: true },
    description: "List return orders with optional date and status filters",
    inputSchema: z.object({ nextCursor: z.string().optional(), returnCreationStartDate: isoDateSchema.optional(), returnCreationEndDate: isoDateSchema.optional(), status: z.string().optional() })
  }, async (input) => runTool("get_returns", input));

  server.registerTool("issue_refund", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Issue a refund for a return order (DANGER — irreversible financial). Defaults to dry_run=true.",
    inputSchema: z.object({
      returnOrderId: z.string().optional(),
      totalRefund: z.number().optional(),
      refundLines: z.array(z.unknown()).default([]),
      purchaseOrderId: z.string().optional(),
      refundAmount: z.number().optional(),
      dry_run: z.boolean().default(true),
    })
  }, async (input) => runTool("issue_refund", input));

  // ── Rules ───────────────────────────────────────────────────────────────────
  server.registerTool("get_rules", { annotations: { readOnlyHint: true }, description: "List all shipping and assortment rules" },
    async () => runTool("get_rules", {}));

  server.registerTool("get_rule", {
    annotations: { readOnlyHint: true },
    description: "Get details for a single rule by ID and status",
    inputSchema: z.object({ ruleId: z.string(), ruleStatus: z.string() })
  }, async (input) => runTool("get_rule", input));

  server.registerTool("get_subcategories", { annotations: { readOnlyHint: true }, description: "Get rule subcategory options" },
    async () => runTool("get_subcategories", {}));

  server.registerTool("get_areas", { annotations: { readOnlyHint: true }, description: "Get available shipping area options" },
    async () => runTool("get_areas", {}));

  server.registerTool("download_exceptions", { annotations: { readOnlyHint: true }, description: "Download rule exception file" },
    async () => runTool("download_exceptions", {}));

  server.registerTool("create_rule", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Create a new shipping or assortment rule. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("create_rule", input));

  server.registerTool("update_rule", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Update an existing rule. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("update_rule", input));

  server.registerTool("delete_rule", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Delete a rule (DANGER — affects shipping configuration). Defaults to dry_run=true.",
    inputSchema: z.object({ ruleId: z.string(), ruleStatus: z.string(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("delete_rule", input));

  server.registerTool("inactivate_rule", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Inactivate a rule. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("inactivate_rule", input));

  server.registerTool("create_exceptions", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Create rule exceptions. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("create_exceptions", input));

  // ── Settings ─────────────────────────────────────────────────────────────────
  server.registerTool("get_carriers", { annotations: { readOnlyHint: true }, description: "List available shipping carriers" },
    async () => runTool("get_carriers", {}));

  server.registerTool("get_fulfillment_centers", { annotations: { readOnlyHint: true }, description: "List fulfillment center coverage" },
    async () => runTool("get_fulfillment_centers", {}));

  server.registerTool("create_fulfillment_center", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Add a new fulfillment center. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("create_fulfillment_center", input));

  server.registerTool("update_fulfillment_center", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Update a fulfillment center. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("update_fulfillment_center", input));

  server.registerTool("create_3pl_node", {
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: "Add a 3PL ship node. Defaults to dry_run=true.",
    inputSchema: z.object({ payload: z.unknown(), dry_run: z.boolean().default(true) })
  }, async (input) => runTool("create_3pl_node", input));

  server.registerTool("get_3pl_providers", { annotations: { readOnlyHint: true }, description: "List 3PL provider options" },
    async () => runTool("get_3pl_providers", {}));

  // ── Lagtime ──────────────────────────────────────────────────────────────────
  server.registerTool("get_lagtime", {
    annotations: { readOnlyHint: true },
    description: "Get fulfillment lag time for a SKU (20/hour rate limit — use sparingly)",
    inputSchema: z.object({ sku: skuSchema })
  }, async ({ sku }) => runTool("get_lagtime", { sku }));

  // ── Prompts + Resources ───────────────────────────────────────────────────────
  server.registerPrompt("onboarding", { description: "Guided setup for Walmart Marketplace MCP" }, () => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: ONBOARDING_TEXT } }]
  }));

  server.registerResource("api-docs", "walmart-marketplace://api-docs", { description: "Tool reference catalog with severity labels" },
    async () => ({ contents: [{ uri: "walmart-marketplace://api-docs", mimeType: "text/plain", text: API_DOCS }] }));

  server.registerResource("account-list", "walmart-marketplace://account-list", { description: "Configured seller accounts" },
    async () => ({ contents: [{ uri: "walmart-marketplace://account-list", mimeType: "application/json", text: JSON.stringify(await listPublicAccounts(), null, 2) }] }));
}
