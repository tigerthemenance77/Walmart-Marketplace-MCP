import { describe, expect, it } from "vitest";
import { previewPrice } from "../../src/safety/dry-run.js";

describe("inventory integration-ish", () => {
  it("computes percent change", () => {
    const out = previewPrice("SKU", 10, 12, "USD");
    expect((out.preview as any).percentChange).toBe("20.0%");
  });
});
