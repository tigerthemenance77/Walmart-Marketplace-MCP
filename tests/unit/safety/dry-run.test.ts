import { describe, expect, it } from "vitest";
import { previewInventory } from "../../../src/safety/dry-run.js";

describe("dry run", () => {
  it("builds inventory preview", () => {
    const out = previewInventory("ABC", 1, 5, "SN1");
    expect(out.dry_run).toBe(true);
    expect(out.operation).toBe("update_inventory");
  });
});
