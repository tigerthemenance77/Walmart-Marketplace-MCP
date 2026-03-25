import { describe, expect, it } from "vitest";
import { getActiveAccount } from "../../../src/accounts/manager.js";

describe("accounts manager", () => {
  it("starts with no active account", () => {
    expect(getActiveAccount()).toBeNull();
  });
});
