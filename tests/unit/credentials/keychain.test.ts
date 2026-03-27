import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SellerAccount } from "../../../src/accounts/types.js";

const account: SellerAccount = {
  alias: "alias",
  clientId: "id",
  clientSecret: "secret",
  sellerId: "seller-id",
  sellerName: "Seller",
  env: "sandbox",
  addedAt: "2026-01-01",
};

describe("keychain", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unmock("keyring");
  });

  it("returns false when module shape is incompatible", async () => {
    vi.doMock("keyring", () => ({
      default: { ALGORITHM: "AES-256", instance: {} },
    }));

    const { saveAccountToKeychain } = await import("../../../src/credentials/keychain.js");

    await expect(saveAccountToKeychain(account)).resolves.toBe(false);
  });

  it("uses module when keytar-like shape on .default", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const getPassword = vi.fn().mockResolvedValue(null);
    const deletePassword = vi.fn().mockResolvedValue(undefined);

    vi.doMock("keyring", () => ({
      setPassword,
      getPassword,
      deletePassword,
    }));

    const { saveAccountToKeychain } = await import("../../../src/credentials/keychain.js");
    await saveAccountToKeychain(account);

    expect(setPassword).toHaveBeenCalledWith(
      "walmart-marketplace-mcp",
      "account:alias",
      JSON.stringify(account),
    );
  });

  it("uses module when keytar-like shape directly on mod", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const getPassword = vi.fn().mockResolvedValue(null);
    const deletePassword = vi.fn().mockResolvedValue(undefined);

    vi.doMock("keyring", () => ({
      __esModule: true,
      setPassword,
      getPassword,
      deletePassword,
    }));

    const { saveAccountToKeychain } = await import("../../../src/credentials/keychain.js");
    await saveAccountToKeychain(account);

    expect(setPassword).toHaveBeenCalledWith(
      "walmart-marketplace-mcp",
      "account:alias",
      JSON.stringify(account),
    );
  });
});
