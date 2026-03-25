import { beforeEach, describe, expect, it, vi } from "vitest";

const accounts = {
  a: { alias: "a", sellerId: "1", sellerName: "Alpha", env: "production" as const, clientId: "", clientSecret: "", addedAt: "" },
  b: { alias: "b", sellerId: "2", sellerName: "Beta", env: "sandbox" as const, clientId: "", clientSecret: "", addedAt: "" },
};

vi.mock("../../src/credentials/manager.js", () => ({
  getCredential: vi.fn(async (alias: string) => (accounts as Record<string, unknown>)[alias] ?? null),
}));

describe("account isolation", () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it("switching accounts changes active context and message", async () => {
    const m = await import("../../src/accounts/manager.js");
    await m.setActiveAccount("a");
    const out = await m.switchActiveAccount("b");
    expect(m.getActiveAccount()?.alias).toBe("b");
    expect(out.message).toContain("Switched from Alpha (a) to Beta (b)");
  });

  it("token cache is isolated per account", async () => {
    const m = await import("../../src/accounts/manager.js");
    m.setTokenCache("a", { accessToken: "tok-a", expiresAt: 10 });
    m.setTokenCache("b", { accessToken: "tok-b", expiresAt: 20 });
    expect(m.getTokenCache("a")?.accessToken).toBe("tok-a");
    expect(m.getTokenCache("b")?.accessToken).toBe("tok-b");
  });
});
