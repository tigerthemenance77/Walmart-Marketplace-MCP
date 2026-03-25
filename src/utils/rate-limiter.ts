export interface LimitDef {
  path: string;
  method: string;
  max: number;
  windowMs: number;
}

export const PHASE1_LIMITS: LimitDef[] = [
  { path: "/v3/orders", method: "GET", max: 5000, windowMs: 60_000 },
  { path: "/v3/orders/released", method: "GET", max: 60, windowMs: 60_000 },
  { path: "/v3/orders/*/acknowledge", method: "POST", max: 60, windowMs: 60_000 },
  { path: "/v3/orders/*/shipping", method: "POST", max: 60, windowMs: 60_000 },
  { path: "/v3/items", method: "GET", max: 300, windowMs: 60_000 },
  { path: "/v3/items/*", method: "GET", max: 900, windowMs: 60_000 },
  { path: "/v3/inventory", method: "GET", max: 200, windowMs: 60_000 },
  { path: "/v3/inventory", method: "PUT", max: 200, windowMs: 60_000 },
  { path: "/v3/price", method: "PUT", max: 100, windowMs: 3_600_000 },
  { path: "/v3/promo/sku/*", method: "GET", max: 300, windowMs: 60_000 },
];

interface BucketState {
  resetAt: number;
  used: number;
}

const normalize = (path: string): string => path.replace(/\/\d+/g, "/*").replace(/\/[A-Za-z0-9._-]{6,}/g, "/*");

export class RateLimiter {
  private readonly limits: LimitDef[];
  private readonly buckets = new Map<string, BucketState>();

  constructor(limits: LimitDef[] = PHASE1_LIMITS) {
    this.limits = limits;
  }

  check(method: string, path: string):
    | { allowed: true; remaining: number; warning?: string }
    | { allowed: false; error: string; retryAfterMs: number } {
    const normalized = normalize(path);
    const hit = this.limits.find((l) => l.method === method.toUpperCase() && this.matchPath(l.path, path, normalized));
    if (!hit) {
      return { allowed: true, remaining: Number.MAX_SAFE_INTEGER };
    }

    const key = `${hit.method}:${hit.path}`;
    const now = Date.now();
    const state = this.buckets.get(key);
    const current = !state || now >= state.resetAt ? { used: 0, resetAt: now + hit.windowMs } : state;

    if (current.used >= hit.max) {
      return { allowed: false, error: `Rate limit exceeded for ${hit.method} ${hit.path}`, retryAfterMs: current.resetAt - now };
    }

    current.used += 1;
    this.buckets.set(key, current);

    const usedPct = (current.used / hit.max) * 100;
    const remaining = hit.max - current.used;
    if (usedPct >= 80) {
      return { allowed: true, remaining, warning: `Rate usage high (${usedPct.toFixed(1)}%) for ${hit.method} ${hit.path}` };
    }
    return { allowed: true, remaining };
  }

  snapshot(): Array<{ method: string; path: string; used: number; max: number; windowMs: number; usagePct: number }> {
    const now = Date.now();
    return this.limits.map((l) => {
      const key = `${l.method}:${l.path}`;
      const state = this.buckets.get(key);
      const used = !state || now >= state.resetAt ? 0 : state.used;
      return { method: l.method, path: l.path, used, max: l.max, windowMs: l.windowMs, usagePct: (used / l.max) * 100 };
    });
  }

  private matchPath(limitPath: string, realPath: string, normalized: string): boolean {
    return limitPath === realPath || limitPath === normalized;
  }
}

export const rateLimiter = new RateLimiter();
