import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../src/utils/rate-limiter.js";

describe("orders integration-ish", () => {
  it("warns at 80%", () => {
    const limiter = new RateLimiter([{ method: "GET", path: "/v3/orders", max: 5, windowMs: 1000 }]);
    limiter.check("GET", "/v3/orders");
    limiter.check("GET", "/v3/orders");
    limiter.check("GET", "/v3/orders");
    const out = limiter.check("GET", "/v3/orders");
    expect(out.allowed).toBe(true);
    expect((out as any).warning).toBeTruthy();
  });
});
