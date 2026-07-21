import type { NextRequest } from "next/server";

interface RateLimitOptions {
  scope: string;
  limit: number;
  windowMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 60_000;
const buckets = new Map<string, Bucket>();
let nextSweepAt = 0;

function clientAddress(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

function pruneBuckets(now: number): void {
  if (now >= nextSweepAt) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    nextSweepAt = now + SWEEP_INTERVAL_MS;
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/**
 * Per-instance abuse backstop. Vercel Firewall remains the global enforcement
 * layer because serverless instances do not share memory.
 */
export function rateLimit(request: NextRequest, options: RateLimitOptions): Response | undefined {
  const now = Date.now();
  pruneBuckets(now);
  const key = `${options.scope}:${clientAddress(request)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + options.windowMs }
    : { ...current, count: current.count + 1 };
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) return undefined;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
  nextSweepAt = 0;
}
