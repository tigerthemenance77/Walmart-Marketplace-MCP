import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrder = vi.fn();
const mockGetInventory = vi.fn();
const mockGetPromoPrice = vi.fn();

vi.mock("../../../src/accounts/manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/accounts/manager.js")>("../../../src/accounts/manager.js");
  return {
    ...actual,
    requireActiveAccount: () => ({ alias: "a", sellerId: "1", sellerName: "Alpha", env: "production" as const, addedAt: "2026-01-01" }),
    accountBanner: () => "📍 Account: Alpha",
    getActiveAccount: () => "a",
  };
});

vi.mock("../../../src/api/orders.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/orders.js")>("../../../src/api/orders.js");
  return { ...actual, getOrder: mockGetOrder };
});

vi.mock("../../../src/api/inventory.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/inventory.js")>("../../../src/api/inventory.js");
  return { ...actual, getInventory: mockGetInventory };
});

vi.mock("../../../src/api/prices.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/api/prices.js")>("../../../src/api/prices.js");
  return { ...actual, getPromoPrice: mockGetPromoPrice };
});

describe("server tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("toolNames includes get_daily_feed_usage", async () => {
    const { toolNames } = await import("../../../src/server.js");
    expect(toolNames.includes("get_daily_feed_usage")).toBe(true);
  });

  it("acknowledge_order dry_run=true returns preview without calling getOrder", async () => {
    mockGetOrder.mockImplementation(() => {
      throw new Error("should not call getOrder");
    });
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("acknowledge_order", { purchaseOrderId: "PO-123", dry_run: true })).resolves.toBeTruthy();
    expect(mockGetOrder).not.toHaveBeenCalled();
  });

  it("update_inventory dry_run=true returns preview without calling getInventory", async () => {
    mockGetInventory.mockImplementation(() => {
      throw new Error("should not call getInventory");
    });
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("update_inventory", { sku: "SKU123", quantity: 3, shipNodeId: "SN1", dry_run: true })).resolves.toBeTruthy();
    expect(mockGetInventory).not.toHaveBeenCalled();
  });

  it("update_price dry_run=true returns preview without calling getPromoPrice", async () => {
    mockGetPromoPrice.mockImplementation(() => {
      throw new Error("should not call getPromoPrice");
    });
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("update_price", { sku: "SKU123", price: 9.99, dry_run: true })).resolves.toBeTruthy();
    expect(mockGetPromoPrice).not.toHaveBeenCalled();
  });
});
