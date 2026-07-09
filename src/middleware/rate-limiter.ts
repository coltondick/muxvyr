/**
 * Rate limiting middleware using Redis counters.
 *
 * Uses ioredis with a 60-second fixed window to enforce per-IP, per-endpoint rate limits.
 *
 * @module middleware/rate-limiter
 */

import { redis } from "../lib/redis.js";
import type { Context, Next } from "hono";

/**
 * Rate limit configurations.
 */
export interface RateLimitConfig {
  pattern: RegExp;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig[] = [
  { pattern: /\/configure/, maxRequests: 10, windowSeconds: 60 },
  { pattern: /\/catalog\//, maxRequests: 30, windowSeconds: 60 },
];

export function findRateLimitConfig(
  endpoint: string,
  configs: RateLimitConfig[] = DEFAULT_RATE_LIMITS
): RateLimitConfig | undefined {
  return configs.find((config) => config.pattern.test(endpoint));
}

export function buildRateLimitKey(ip: string, endpoint: string): string {
  const normalizedEndpoint = endpoint.replace(/[^a-zA-Z0-9/]/g, "").replace(/\//g, ":");
  return `ratelimit:${ip}:${normalizedEndpoint}`;
}

/**
 * Checks whether a request from the given IP to the given endpoint is within the rate limit.
 */
export async function checkRateLimit(
  ip: string,
  endpoint: string
): Promise<RateLimitResult> {
  const config = findRateLimitConfig(endpoint);
  if (!config) {
    return { allowed: true, remaining: -1, resetAt: 0 };
  }

  const key = buildRateLimitKey(ip, endpoint);
  const ttl = config.windowSeconds;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ttl);
  const results = await pipeline.exec();

  const currentCount = (results?.[0]?.[1] as number) ?? 1;
  const resetAt = Math.floor(Date.now() / 1000) + ttl;
  const remaining = Math.max(0, config.maxRequests - currentCount);
  const allowed = currentCount <= config.maxRequests;

  return { allowed, remaining, resetAt };
}

/**
 * Returns a 429 rate limit exceeded JSON response.
 */
export function rateLimitResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Hono middleware for rate limiting specific patterns.
 */
export function rateLimitMiddleware(patterns: RateLimitConfig[] = DEFAULT_RATE_LIMITS) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
               c.req.header("X-Real-IP") ||
               "unknown";
    const path = c.req.path;
    const config = findRateLimitConfig(path, patterns);
    if (!config) {
      await next();
      return;
    }
    const result = await checkRateLimit(ip, path);
    if (!result.allowed) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Try again later." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    await next();
  };
}
