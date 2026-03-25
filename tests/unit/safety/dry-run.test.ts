import { beforeEach, describe, expect, it, vi } from "vitest";

const writeAuditEntry = vi.fn(async () => undefined);

vi.mock("../../../src/safety/audit-log.js", () => ({ writeAuditEntry }));
vi.mock("../../../src/accounts/manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/accounts/manager.js")>("../../../src/accounts/manager.js");
  return {
    ...actual,
    requireActiveAccount: () => ({ alias: "a", sellerId: "1", sellerName: "Alpha", env: "production" as const }),
    accountBanner: () => "📍 Account: Alpha",
  };
});
vi.mock("../../../src/api/items.js", () => ({ getItems: vi.fn(), getItem: vi.fn(), retireItem: vi.fn(async () => ({ data: {}, status: 200 })) }));
vi.mock("../../../src/api/orders.js", () => ({ getOrders: vi.fn(), getOrder: vi.fn(async () => ({ data: {}, status: 200 })), getReleasedOrders: vi.fn(), acknowledgeOrder: vi.fn(async () => ({ data: {}, status: 200 })), shipOrder: vi.fn(async () => ({ data: {}, status: 200 })) }));
vi.mock("../../../src/api/inventory.js", () => ({ getInventory: vi.fn(async () => ({ data: { quantity: { amount: 1 } }, status: 200 })), updateInventory: vi.fn(async () => ({ data: {}, status: 200 })) }));
vi.mock("../../../src/api/prices.js", () => ({ getPromoPrice: vi.fn(async () => ({ data: { price: { amount: 5 } }, status: 200 })), updatePrice: vi.fn(async () => ({ data: {}, status: 200 })) }));
vi.mock("../../../src/api/feeds.js", () => ({
  feedSeverity: vi.fn(() => "WARN"),
  getDailyFeedUsage: vi.fn(async () => ({ used: 0, remaining: 6, limit: 6 })),
  getFeedItemStatus: vi.fn(),
  listFeeds: vi.fn(),
  submitFeed: vi.fn(async () => ({ data: {}, status: 200 })),
  bulkUpdateInventory: vi.fn(async () => ({ data: {}, status: 200 })),
  bulkUpdatePrices: vi.fn(async () => ({ data: {}, status: 200 })),
}));
vi.mock("../../../src/api/returns.js", () => ({ getReturns: vi.fn(), issueRefund: vi.fn(async () => ({ data: {}, status: 200 })) }));
vi.mock("../../../src/api/rules.js", () => ({
  getRules: vi.fn(), getRule: vi.fn(), getSubcategories: vi.fn(), getAreas: vi.fn(), downloadExceptions: vi.fn(),
  createRule: vi.fn(async () => ({ data: {}, status: 200 })), updateRule: vi.fn(async () => ({ data: {}, status: 200 })),
  deleteRule: vi.fn(async () => ({ data: {}, status: 200 })), inactivateRule: vi.fn(async () => ({ data: {}, status: 200 })),
  createExceptions: vi.fn(async () => ({ data: {}, status: 200 })),
}));
vi.mock("../../../src/api/settings.js", () => ({
  getCarriers: vi.fn(), getFulfillmentCenters: vi.fn(), get3plProviders: vi.fn(),
  createFulfillmentCenter: vi.fn(async () => ({ data: {}, status: 200 })), updateFulfillmentCenter: vi.fn(async () => ({ data: {}, status: 200 })), create3plNode: vi.fn(async () => ({ data: {}, status: 200 })),
}));
vi.mock("../../../src/api/lagtime.js", () => ({ getLagtime: vi.fn() }));

describe("dry run", () => {
  beforeEach(() => {
    writeAuditEntry.mockClear();
  });

  it("write tools preview by default with dry_run=true", async () => {
    const { handleTool } = await import("../../../src/server.js");
    const cases: Array<[string, unknown]> = [
      ["retire_item", { sku: "ABC" }],
      ["update_inventory", { sku: "ABC", quantity: 2, shipNodeId: "SN1" }],
      ["update_price", { sku: "ABC", currency: "USD", price: 10 }],
      ["submit_feed", { feedType: "inventory", feedPayload: {} }],
      ["issue_refund", { returnOrderId: "R1", totalRefund: 1 }],
      ["delete_rule", { ruleId: "RULE1", ruleStatus: "ACTIVE" }],
    ];
    for (const [tool, params] of cases) {
      const out = (await handleTool(tool, params)) as { data: { dry_run?: boolean } };
      expect(out.data.dry_run).toBe(true);
    }
    expect(writeAuditEntry).not.toHaveBeenCalled();
  });

  it("write tools execute with dry_run=false and write audit entries", async () => {
    const { handleTool } = await import("../../../src/server.js");
    const cases: Array<[string, unknown]> = [
      ["retire_item", { sku: "ABC", dry_run: false }],
      ["update_inventory", { sku: "ABC", quantity: 2, shipNodeId: "SN1", dry_run: false }],
      ["update_price", { sku: "ABC", currency: "USD", price: 10, dry_run: false }],
      ["submit_feed", { feedType: "inventory", feedPayload: {}, dry_run: false }],
      ["issue_refund", { returnOrderId: "R1", totalRefund: 1, refundLines: [], dry_run: false }],
      ["delete_rule", { ruleId: "RULE1", ruleStatus: "ACTIVE", dry_run: false }],
    ];
    for (const [tool, params] of cases) {
      const out = (await handleTool(tool, params)) as { data: { executed?: boolean } };
      expect(out.data.executed).toBe(true);
    }
    expect(writeAuditEntry).toHaveBeenCalled();
  });
});
