import { z } from "zod";
import { allAccounts, accountBanner, getActiveAccount, requireActiveAccount, setActiveAccount, switchActiveAccount, saveAccount } from "./accounts/manager.js";
import { getCredential } from "./credentials/manager.js";
import { verifyAccountCredentials } from "./auth/oauth.js";
import { getItems, getItem } from "./api/items.js";
import { getOrders, getOrder, getReleasedOrders, acknowledgeOrder, shipOrder } from "./api/orders.js";
import { getInventory, updateInventory } from "./api/inventory.js";
import { getPromoPrice, updatePrice } from "./api/prices.js";
import { previewAcknowledgeOrder, previewInventory, previewPrice, previewShipOrder } from "./safety/dry-run.js";
import { writeAuditEntry } from "./safety/audit-log.js";
import { rateLimiter } from "./utils/rate-limiter.js";
import { isoDateSchema, priceSchema, purchaseOrderIdSchema, quantitySchema, skuSchema } from "./utils/validation.js";

const withAccount = <T>(data: T, warning?: string): { data: T; account: string; warning?: string } => ({
  data,
  account: accountBanner(),
  ...(warning ? { warning } : {}),
});

type ToolHandler = (params: unknown) => Promise<unknown>;

const activeAlias = (): string => requireActiveAccount().alias;
const makeAuditId = (tool: string, ref: string): string => `audit_${new Date().toISOString()}_${tool}_${ref}`;

const tools: Record<string, ToolHandler> = {
  list_accounts: async () => ({ accounts: await allAccounts() }),
  get_active_account: async () => ({ active: getActiveAccount() ?? "none set" }),
  set_account: async (params) => {
    const input = z.object({ alias: z.string() }).strict().parse(params);
    const ctx = await setActiveAccount(input.alias);
    return { active: ctx, account: accountBanner() };
  },
  switch_account: async (params) => {
    const input = z.object({ alias: z.string() }).strict().parse(params);
    const out = await switchActiveAccount(input.alias);
    return { message: out.message, account: accountBanner() };
  },
  refresh_account_info: async () => {
    const ctx = requireActiveAccount();
    const existing = await getCredential(ctx.alias);
    if (!existing) throw new Error("Account not found");
    const detail = await verifyAccountCredentials(ctx.alias);
    await saveAccount({
      ...existing,
      sellerId: detail.sellerId,
      sellerName: detail.sellerName,
    });
    return withAccount({ sellerName: detail.sellerName, sellerId: detail.sellerId });
  },
  get_rate_limits: async () => withAccount({ limits: rateLimiter.snapshot() }),

  get_items: async (params) => {
    const input = z.object({ nextCursor: z.string().optional(), sku: z.string().optional(), lifecycleStatus: z.string().optional(), publishedStatus: z.string().optional(), limit: z.number().optional() }).strict().parse(params ?? {});
    const out = await getItems(activeAlias(), input);
    return withAccount(out.data, out.warning);
  },
  get_item: async (params) => {
    const input = z.object({ id: z.string() }).strict().parse(params);
    const out = await getItem(activeAlias(), input.id);
    return withAccount(out.data, out.warning);
  },

  get_orders: async (params) => {
    const input = z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), status: z.string().optional(), shipNodeType: z.string().optional(), limit: z.number().optional() }).strict().parse(params);
    const out = await getOrders(activeAlias(), input);
    return withAccount(out.data, out.warning);
  },
  get_order: async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema }).strict().parse(params);
    const out = await getOrder(activeAlias(), input.purchaseOrderId);
    return withAccount(out.data, out.warning);
  },
  get_released_orders: async (params) => {
    const input = z.object({ createdStartDate: isoDateSchema, createdEndDate: isoDateSchema.optional(), limit: z.number().optional() }).strict().parse(params);
    const out = await getReleasedOrders(activeAlias(), input);
    return withAccount(out.data, out.warning);
  },
  acknowledge_order: async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema, dry_run: z.boolean().default(true) }).strict().parse(params);
    const order = await getOrder(activeAlias(), input.purchaseOrderId);
    if (input.dry_run) return withAccount(previewAcknowledgeOrder(input.purchaseOrderId, order.data as Record<string, unknown>));

    const out = await acknowledgeOrder(activeAlias(), input.purchaseOrderId);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("acknowledge_order", input.purchaseOrderId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "acknowledge_order", params: { purchaseOrderId: input.purchaseOrderId, dry_run: false }, httpMethod: "POST", httpPath: `/v3/orders/${input.purchaseOrderId}/acknowledge`, httpStatus: out.status, success: true, responseSummary: "Order acknowledged" });
    return withAccount({ executed: true, auditId }, out.warning);
  },
  ship_order: async (params) => {
    const input = z.object({ purchaseOrderId: purchaseOrderIdSchema, orderLines: z.array(z.object({ lineNumber: z.string(), carrierName: z.string(), trackingNumber: z.string() }).passthrough()), dry_run: z.boolean().default(true) }).strict().parse(params);
    if (input.dry_run) return withAccount(previewShipOrder(input.purchaseOrderId, input.orderLines));

    const out = await shipOrder(activeAlias(), input.purchaseOrderId, input.orderLines);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("ship_order", input.purchaseOrderId);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "ship_order", params: { purchaseOrderId: input.purchaseOrderId, orderLines: input.orderLines, dry_run: false }, httpMethod: "POST", httpPath: `/v3/orders/${input.purchaseOrderId}/shipping`, httpStatus: out.status, success: true, responseSummary: "Shipping confirmation submitted" });
    return withAccount({ executed: true, auditId }, out.warning);
  },

  get_inventory: async (params) => {
    const input = z.object({ sku: z.string().optional(), source: z.string().optional() }).strict().parse(params ?? {});
    const out = await getInventory(activeAlias(), input);
    return withAccount(out.data, out.warning);
  },
  update_inventory: async (params) => {
    const input = z.object({ sku: skuSchema, quantity: quantitySchema, shipNodeId: z.string(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const current = await getInventory(activeAlias(), { sku: input.sku });
    const currentQuantity = Number((current.data as any)?.quantity?.amount ?? 0);

    if (input.dry_run) return withAccount(previewInventory(input.sku, currentQuantity, input.quantity, input.shipNodeId), current.warning);

    const out = await updateInventory(activeAlias(), input.sku, input.quantity, input.shipNodeId);
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("update_inventory", input.sku);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "update_inventory", params: { sku: input.sku, quantity: input.quantity, shipNodeId: input.shipNodeId, dry_run: false }, httpMethod: "PUT", httpPath: `/v3/inventory/${input.sku}`, httpStatus: out.status, success: true, responseSummary: "Inventory updated" });
    return withAccount({ executed: true, auditId }, out.warning || current.warning);
  },

  get_promo_price: async (params) => {
    const input = z.object({ sku: skuSchema }).strict().parse(params);
    const out = await getPromoPrice(activeAlias(), input.sku);
    return withAccount(out.data, out.warning);
  },
  update_price: async (params) => {
    const input = z.object({ sku: skuSchema, currency: z.string().min(3).max(3), price: priceSchema, promo: z.unknown().optional(), dry_run: z.boolean().default(true) }).strict().parse(params);
    const current = await getPromoPrice(activeAlias(), input.sku);
    const currentPrice = Number((current.data as any)?.price?.amount ?? 0);

    if (input.dry_run) return withAccount(previewPrice(input.sku, currentPrice, input.price), current.warning);

    const out = await updatePrice(activeAlias(), { sku: input.sku, currency: input.currency, price: input.price, promo: input.promo });
    const ctx = requireActiveAccount();
    const auditId = makeAuditId("update_price", input.sku);
    await writeAuditEntry({ auditId, timestamp: new Date().toISOString(), accountAlias: ctx.alias, sellerId: ctx.sellerId, tool: "update_price", params: { sku: input.sku, currency: input.currency, price: input.price, promo: input.promo, dry_run: false }, httpMethod: "PUT", httpPath: "/v3/price", httpStatus: out.status, success: true, responseSummary: "Price updated" });
    return withAccount({ executed: true, auditId }, out.warning || current.warning);
  },
};

export const handleTool = async (method: string, params: unknown): Promise<unknown> => {
  const fn = tools[method];
  if (!fn) throw new Error(`Unknown method: ${method}`);

  const accountFree = new Set(["list_accounts", "get_active_account", "set_account", "switch_account"]);
  if (!accountFree.has(method)) requireActiveAccount();

  return fn(params);
};

export const toolNames = Object.keys(tools);
