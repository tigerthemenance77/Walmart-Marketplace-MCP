import { describe, it, expect } from "vitest";
import { renderFeedUsageGauge } from "../../../src/visualizations/feed-usage-gauge.js";

const base = { feedType: "PRICE_AND_PROMOTION", breakdown: [], limit: 6 };

describe("renderFeedUsageGauge", () => {
  it("shows green color when used=0", () => {
    const html = renderFeedUsageGauge({ ...base, used: 0 });
    expect(html).toContain("#22c55e");
  });

  it("shows green color when used=2", () => {
    const html = renderFeedUsageGauge({ ...base, used: 2 });
    expect(html).toContain("#22c55e");
  });

  it("shows yellow color when used=3", () => {
    const html = renderFeedUsageGauge({ ...base, used: 3 });
    expect(html).toContain("#eab308");
  });

  it("shows yellow color when used=4", () => {
    const html = renderFeedUsageGauge({ ...base, used: 4 });
    expect(html).toContain("#eab308");
  });

  it("shows orange color when used=5", () => {
    const html = renderFeedUsageGauge({ ...base, used: 5 });
    expect(html).toContain("#f97316");
  });

  it("shows red color when used=6 (blocked)", () => {
    const html = renderFeedUsageGauge({ ...base, used: 6 });
    expect(html).toContain("#ef4444");
  });

  it("shows BLOCKED center label when used >= limit", () => {
    const html = renderFeedUsageGauge({ ...base, used: 6 });
    expect(html).toContain("BLOCKED");
  });

  it("shows X/6 center label when not blocked", () => {
    const html = renderFeedUsageGauge({ ...base, used: 3 });
    expect(html).toContain("3/6");
  });

  it("renders breakdown rows when provided", () => {
    const html = renderFeedUsageGauge({
      ...base,
      used: 2,
      breakdown: [{ type: "PRICE_AND_PROMOTION", count: 2, lastUsed: "2026-03-27T10:00:00.000Z" }],
    });
    expect(html).toContain("PRICE_AND_PROMOTION");
    expect(html).toContain("2026-03-27T10:00:00.000Z");
  });

  it("shows empty state when breakdown is empty", () => {
    const html = renderFeedUsageGauge({ ...base, used: 0, breakdown: [] });
    expect(html).toContain("No feeds submitted today");
  });

  it("HTML output is under 10KB", () => {
    const html = renderFeedUsageGauge({
      ...base,
      used: 3,
      breakdown: [
        { type: "PRICE_AND_PROMOTION", count: 2 },
        { type: "inventory", count: 1 },
      ],
    });
    expect(Buffer.byteLength(html, "utf8")).toBeLessThan(10_000);
  });

  it("escapes HTML special characters in feedType", () => {
    const html = renderFeedUsageGauge({ ...base, feedType: "<script>alert('xss')</script>", used: 0 });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
