import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/credentials/manager.js", () => ({
  getCredential: vi.fn(),
}));

vi.mock("../../../src/accounts/manager.js", () => ({
  getTokenCache: vi.fn(),
  setTokenCache: vi.fn(),
  clearTokenCache: vi.fn(),
}));

import { getCredential } from "../../../src/credentials/manager.js";
import { getTokenCache } from "../../../src/accounts/manager.js";
import { baseUrlForEnv, fetchAccessToken, verifyRawCredentials } from "../../../src/auth/oauth.js";

describe("oauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns sandbox base", () => {
    expect(baseUrlForEnv("sandbox")).toBe("https://sandbox.walmartapis.com");
  });

  it("fetchAccessToken sends Accept: application/json", async () => {
    vi.mocked(getCredential).mockResolvedValue({
      alias: "test-alias",
      clientId: "id",
      clientSecret: "secret",
      sellerId: "sid",
      sellerName: "seller",
      env: "sandbox",
      addedAt: "2026-01-01",
    });
    vi.mocked(getTokenCache).mockReturnValue(undefined);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAccessToken("test-alias");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Accept: "application/json" });
  });

  it("verifyRawCredentials sends Accept: application/json on the /v3/token call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sellerName: "Test Seller", sellerId: "123" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await verifyRawCredentials({ clientId: "id", clientSecret: "secret", env: "sandbox" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstInit.headers).toMatchObject({ Accept: "application/json" });
  });
});
