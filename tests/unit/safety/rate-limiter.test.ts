import { describe, expect, it } from "vitest";
import { RateLimiter } from "../../../src/utils/rate-limiter.js";

describe("rate limiter", () => {
  it("triggers warning at 80%", () => {
    const limiter = new RateLimiter([{ path: "/x", method: "GET", max: 5, windowMs: 60_000 }]);
    limiter.check("GET", "/x");
    limiter.check("GET", "/x");
    limiter.check("GET", "/x");
    const res = limiter.check("GET", "/x");
    expect(res.allowed).toBe(true);
    if (res.allowed) expect(res.warning).toContain("80.0%");
  });

  it("blocks at 100%", () => {
    const limiter = new RateLimiter([{ path: "/x", method: "GET", max: 1, windowMs: 60_000 }]);
    limiter.check("GET", "/x");
    const blocked = limiter.check("GET", "/x");
    expect(blocked.allowed).toBe(false);
  });

  it("resets after window", async () => {
    const limiter = new RateLimiter([{ path: "/x", method: "GET", max: 1, windowMs: 10 }]);
    limiter.check("GET", "/x");
    await new Promise((r) => setTimeout(r, 12));
    const next = limiter.check("GET", "/x");
    expect(next.allowed).toBe(true);
  });

  it("marks exhausted on sync429", () => {
    const limiter = new RateLimiter([{ path: "/x", method: "GET", max: 5, windowMs: 60_000 }]);
    limiter.sync429("GET", "/x");
    const blocked = limiter.check("GET", "/x");
    expect(blocked.allowed).toBe(false);
  });
});
