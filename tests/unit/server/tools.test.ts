import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/accounts/manager.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/accounts/manager.js")>("../../../src/accounts/manager.js");
  return {
    ...actual,
    requireActiveAccount: () => ({ alias: "a", sellerId: "1", sellerName: "Alpha", env: "production" as const, addedAt: "2026-01-01" }),
    accountBanner: () => "📍 Account: Alpha",
  };
});

describe("server tools", () => {
  it("toolNames includes get_daily_feed_usage", async () => {
    const { toolNames } = await import("../../../src/server.js");
    expect(toolNames.includes("get_daily_feed_usage")).toBe(true);
  });
});
