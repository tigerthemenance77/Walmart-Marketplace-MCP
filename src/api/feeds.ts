import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { requestJson } from "./client.js";
import { Severity } from "../safety/severity.js";

const FEED_USAGE_DIR = join(homedir(), ".walmart-marketplace-mcp");
const FEED_USAGE_FILE = join(FEED_USAGE_DIR, "feed-usage.json");
const DAILY_LIMITED_FEEDS = new Set(["PRICE_AND_PROMOTION", "promo", "lagtime", "WALMART_FUNDED_INCENTIVES_ENROLLMENT"]);

export type FeedUsage = Record<string, { count: number; date: string }>;

const todayUtc = (): string => new Date().toISOString().slice(0, 10);

export const feedSeverity = (feedType: string): Severity => {
  if (DAILY_LIMITED_FEEDS.has(feedType) || feedType === "delete_item") return Severity.DANGER;
  return Severity.WARN;
};

export const loadFeedUsage = async (): Promise<FeedUsage> => {
  try {
    const raw = await readFile(FEED_USAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as FeedUsage;
    const today = todayUtc();
    for (const [key, value] of Object.entries(parsed)) {
      if (value.date !== today) parsed[key] = { count: 0, date: today };
    }
    return parsed;
  } catch {
    return {};
  }
};

export const saveFeedUsage = async (usage: FeedUsage): Promise<void> => {
  await mkdir(FEED_USAGE_DIR, { recursive: true, mode: 0o700 });
  await writeFile(FEED_USAGE_FILE, JSON.stringify(usage, null, 2), "utf8");
};

export const getDailyFeedUsage = async (feedType: string): Promise<{ used: number; remaining: number; limit: number }> => {
  const usage = await loadFeedUsage();
  const rec = usage[feedType] ?? { count: 0, date: todayUtc() };
  const used = rec.date === todayUtc() ? rec.count : 0;
  return { used, remaining: Math.max(0, 6 - used), limit: 6 };
};

const incrementDailyFeedUsage = async (feedType: string): Promise<void> => {
  const usage = await loadFeedUsage();
  const today = todayUtc();
  const current = usage[feedType];
  const count = current && current.date === today ? current.count : 0;
  usage[feedType] = { count: count + 1, date: today };
  await saveFeedUsage(usage);
};

export const submitFeed = async (alias: string, feedType: string, feedPayload: unknown) => {
  if (DAILY_LIMITED_FEEDS.has(feedType)) {
    const { used } = await getDailyFeedUsage(feedType);
    if (used >= 6) {
      throw new Error(`Daily limit reached for ${feedType}. Used 6/6 today; submission blocked.`);
    }
  }

  const out = await requestJson({
    alias,
    method: "POST",
    path: "/v3/feeds",
    query: { feedType },
    body: feedPayload,
  });

  if (DAILY_LIMITED_FEEDS.has(feedType)) await incrementDailyFeedUsage(feedType);

  return out;
};

export const getFeedItemStatus = (alias: string, feedId: string) =>
  requestJson({ alias, method: "GET", path: `/v3/feeds/${encodeURIComponent(feedId)}`, query: { includeDetails: "true" } });

export const listFeeds = (alias: string, params: Record<string, unknown>) =>
  requestJson({ alias, method: "GET", path: "/v3/feeds", query: params as Record<string, string | number | undefined> });

export const bulkUpdateInventory = (alias: string, payload: unknown) => submitFeed(alias, "inventory", payload);
export const bulkUpdatePrices = (alias: string, payload: unknown) => submitFeed(alias, "PRICE_AND_PROMOTION", payload);
