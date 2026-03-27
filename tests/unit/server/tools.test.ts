import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrder = vi.fn();
const mockGetInventory = vi.fn();
const mockGetPromoPrice = vi.fn();
const mockAllAccounts = vi.fn();

vi.mock("../../../src/accounts/manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/accounts/manager.js")>("../../../src/accounts/manager.js");
  return {
    ...actual,
    allAccounts: mockAllAccounts,
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
    mockAllAccounts.mockResolvedValue([
      {
        alias: "a",
        sellerName: "Alpha",
        sellerId: "1",
        env: "production",
        addedAt: "2026-01-01",
        clientId: "secret-id",
        clientSecret: "secret-secret",
      },
    ]);
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

  it("update_price schema accepts missing currency and defaults to USD", async () => {
    const toolDefs = new Map<string, { inputSchema?: { parse: (input: unknown) => any } }>();
    const fakeServer = {
      registerTool: (name: string, config: { inputSchema?: { parse: (input: unknown) => any } }) => {
        toolDefs.set(name, config);
      },
      registerPrompt: vi.fn(),
      registerResource: vi.fn(),
    } as any;

    const { registerTools } = await import("../../../src/server.js");
    registerTools(fakeServer);

    const parsed = toolDefs.get("update_price")?.inputSchema?.parse({ sku: "SKU123", price: 9.99 });
    expect(parsed?.currency).toBe("USD");
  });

  it("previewPrice dry-run output includes currency key", async () => {
    const { previewPrice } = await import("../../../src/safety/dry-run.js");
    const result = previewPrice("SKU123", 0, 9.99, "USD") as { preview: { currency?: string } };
    expect(result.preview.currency).toBe("USD");
  });

  it("issue_refund accepts canonical returnOrderId + totalRefund", async () => {
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("issue_refund", { returnOrderId: "RO-123", totalRefund: 19.99, dry_run: true })).resolves.toBeTruthy();
  });

  it("issue_refund accepts legacy purchaseOrderId + refundAmount", async () => {
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("issue_refund", { purchaseOrderId: "PO-123", refundAmount: 19.99, dry_run: true })).resolves.toBeTruthy();
  });

  it("issue_refund throws when neither canonical nor legacy keys present", async () => {
    const { handleTool } = await import("../../../src/server.js");
    await expect(handleTool("issue_refund", { dry_run: true })).rejects.toThrow();
  });

  it("list_accounts does not expose clientId or clientSecret", async () => {
    const { handleTool } = await import("../../../src/server.js");
    const result = await handleTool("list_accounts", {}) as { accounts: Array<Record<string, unknown>> };
    expect(result.accounts[0]).not.toHaveProperty("clientId");
    expect(result.accounts[0]).not.toHaveProperty("clientSecret");
  });

  it("account-list resource does not expose credentials", async () => {
    const resourceHandlers = new Map<string, () => Promise<{ contents: Array<{ text: string }> }>>();
    const fakeServer = {
      registerTool: vi.fn(),
      registerPrompt: vi.fn(),
      registerResource: (_name: string, uri: string, _config: unknown, cb: () => Promise<{ contents: Array<{ text: string }> }>) => {
        resourceHandlers.set(uri, cb);
      },
    } as any;

    const { registerTools } = await import("../../../src/server.js");
    registerTools(fakeServer);

    const payload = await resourceHandlers.get("walmart-marketplace://account-list")?.();
    const accounts = JSON.parse(payload?.contents[0]?.text ?? "[]") as Array<Record<string, unknown>>;

    expect(accounts[0]).not.toHaveProperty("clientId");
    expect(accounts[0]).not.toHaveProperty("clientSecret");
  });
});
