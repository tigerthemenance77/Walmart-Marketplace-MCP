import { describe, expect, it } from "vitest";
import { baseUrlForEnv } from "../../../src/auth/oauth.js";

describe("oauth", () => {
  it("returns sandbox base", () => {
    expect(baseUrlForEnv("sandbox")).toBe("https://sandbox.walmartapis.com");
  });
});
