import { describe, expect, it } from "vitest";
import { writeAuditEntry } from "../../src/safety/audit-log.js";

describe("credential redaction", () => {
  it("has writer function", () => {
    expect(typeof writeAuditEntry).toBe("function");
  });
});
