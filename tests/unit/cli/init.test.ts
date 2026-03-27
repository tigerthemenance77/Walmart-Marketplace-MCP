import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const questionMock = vi.fn<(q: string) => Promise<string>>();
const closeMock = vi.fn();

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: questionMock,
    close: closeMock,
  })),
}));

vi.mock("../../../src/credentials/keychain.js", () => ({
  isKeychainAvailable: vi.fn(),
}));

vi.mock("../../../src/auth/oauth.js", () => ({
  verifyRawCredentials: vi.fn(),
}));

vi.mock("../../../src/accounts/manager.js", () => ({
  saveAccount: vi.fn(),
}));

import { isKeychainAvailable } from "../../../src/credentials/keychain.js";
import { verifyRawCredentials } from "../../../src/auth/oauth.js";
import { saveAccount } from "../../../src/accounts/manager.js";
import { runInit } from "../../../cli/init.js";

describe("runInit", () => {
  const originalTTY = process.stdin.isTTY;
  const originalPassword = process.env.WALMART_MASTER_PASSWORD;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WALMART_MASTER_PASSWORD;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    vi.mocked(verifyRawCredentials).mockResolvedValue({
      sellerName: "Test Seller",
      sellerId: "123",
      env: "sandbox",
    });
    vi.mocked(saveAccount).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalPassword === undefined) {
      delete process.env.WALMART_MASTER_PASSWORD;
    } else {
      process.env.WALMART_MASTER_PASSWORD = originalPassword;
    }
    Object.defineProperty(process.stdin, "isTTY", { value: originalTTY, configurable: true });
  });

  it("prompts for master password when keychain unavailable and env unset (TTY=true)", async () => {
    vi.mocked(isKeychainAvailable).mockResolvedValue(false);
    questionMock.mockResolvedValueOnce("secret123");

    await runInit(["--alias", "alias", "--client-id", "id", "--client-secret", "secret", "--env", "sandbox"]);

    expect(process.env.WALMART_MASTER_PASSWORD).toBe("secret123");
  });

  it("throws clear error when keychain unavailable, env unset, and stdin.isTTY=false", async () => {
    vi.mocked(isKeychainAvailable).mockResolvedValue(false);
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    await expect(runInit()).rejects.toThrow(/WALMART_MASTER_PASSWORD/);
  });

  it("does not prompt when WALMART_MASTER_PASSWORD already set", async () => {
    vi.mocked(isKeychainAvailable).mockResolvedValue(false);
    process.env.WALMART_MASTER_PASSWORD = "existing";

    await runInit(["--alias", "alias", "--client-id", "id", "--client-secret", "secret", "--env", "sandbox"]);

    expect(questionMock).not.toHaveBeenCalledWith("Master password for encrypted credential storage: ");
  });

  it("does not prompt when keychain available", async () => {
    vi.mocked(isKeychainAvailable).mockResolvedValue(true);

    await runInit(["--alias", "alias", "--client-id", "id", "--client-secret", "secret", "--env", "sandbox"]);

    expect(questionMock).not.toHaveBeenCalledWith("Master password for encrypted credential storage: ");
  });
});
