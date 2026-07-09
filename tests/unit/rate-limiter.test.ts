/**
 * Unit tests for rate limiting middleware.
 *
 * @requirements 16.7
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  checkRateLimit,
  rateLimitResponse,
  buildRateLimitKey,
  findRateLimitConfig,
  DEFAULT_RATE_LIMITS,
  executeRedisPipeline,
} from "../../src/middleware/rate-limiter";
import type { WorkerEnv } from "../../src/types";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY: "0".repeat(64),
};

describe("rate-limiter", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("buildRateLimitKey", () => {
    it("builds key with correct pattern ratelimit:{ip}:{endpoint}", () => {
      const key = buildRateLimitKey("192.168.1.1", "/configure");
      expect(key).toBe("ratelimit:192.168.1.1::configure");
    });

    it("normalizes endpoint paths", () => {
      const key = buildRateLimitKey(
        "10.0.0.1",
        "/abc-123/catalog/movie/ai-recs.json"
      );
      expect(key).toMatch(/^ratelimit:10\.0\.0\.1:/);
      // Special chars (hyphens, dots) are stripped; slashes become colons
      expect(key).toBe("ratelimit:10.0.0.1::abc123:catalog:movie:airecsjson");
    });

    it("includes the IP address in the key", () => {
      const key = buildRateLimitKey("203.0.113.42", "/configure");
      expect(key).toContain("203.0.113.42");
    });
  });

  describe("findRateLimitConfig", () => {
    it("matches configure endpoint", () => {
      const config = findRateLimitConfig("/some-uuid/configure");
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(10);
    });

    it("matches catalog endpoint", () => {
      const config = findRateLimitConfig(
        "/some-uuid/catalog/movie/ai-recommendations.json"
      );
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(30);
    });

    it("returns undefined for unmatched endpoints", () => {
      const config = findRateLimitConfig("/some-uuid/manifest.json");
      expect(config).toBeUndefined();
    });

    it("returns undefined for root path", () => {
      const config = findRateLimitConfig("/");
      expect(config).toBeUndefined();
    });
  });

  describe("DEFAULT_RATE_LIMITS", () => {
    it("has configuration endpoint at 10 requests/minute", () => {
      const config = DEFAULT_RATE_LIMITS.find((c) =>
        c.pattern.test("/configure")
      );
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(10);
      expect(config!.windowSeconds).toBe(60);
    });

    it("has catalog endpoint at 30 requests/minute", () => {
      const config = DEFAULT_RATE_LIMITS.find((c) =>
        c.pattern.test("/catalog/")
      );
      expect(config).toBeDefined();
      expect(config!.maxRequests).toBe(30);
      expect(config!.windowSeconds).toBe(60);
    });
  });

  describe("checkRateLimit", () => {
    function mockRedisResponse(count: number) {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ result: count }, { result: 1 }]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    it("allows request when under limit", async () => {
      mockRedisResponse(5);

      const result = await checkRateLimit(
        "192.168.1.1",
        "/some-uuid/configure",
        mockEnv
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // 10 - 5
    });

    it("allows request at exactly the limit", async () => {
      mockRedisResponse(10);

      const result = await checkRateLimit(
        "192.168.1.1",
        "/some-uuid/configure",
        mockEnv
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it("denies request when over limit", async () => {
      mockRedisResponse(11);

      const result = await checkRateLimit(
        "192.168.1.1",
        "/some-uuid/configure",
        mockEnv
      );

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("uses different limits for configure vs catalog endpoints", async () => {
      // Configure: 10 req/min - 11th request should be denied
      mockRedisResponse(11);
      const configResult = await checkRateLimit(
        "10.0.0.1",
        "/uuid/configure",
        mockEnv
      );
      expect(configResult.allowed).toBe(false);

      // Catalog: 30 req/min - 11th request should be allowed
      mockRedisResponse(11);
      const catalogResult = await checkRateLimit(
        "10.0.0.1",
        "/uuid/catalog/movie/ai-recs.json",
        mockEnv
      );
      expect(catalogResult.allowed).toBe(true);
      expect(catalogResult.remaining).toBe(19); // 30 - 11
    });

    it("allows requests to endpoints without rate limiting", async () => {
      const result = await checkRateLimit(
        "10.0.0.1",
        "/some-uuid/manifest.json",
        mockEnv
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1);
      // Should not call Redis at all
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns a valid resetAt timestamp", async () => {
      mockRedisResponse(1);
      const before = Math.floor(Date.now() / 1000);

      const result = await checkRateLimit(
        "10.0.0.1",
        "/uuid/configure",
        mockEnv
      );

      const after = Math.floor(Date.now() / 1000);
      expect(result.resetAt).toBeGreaterThanOrEqual(before + 60);
      expect(result.resetAt).toBeLessThanOrEqual(after + 60);
    });

    it("sends correct Redis pipeline commands", async () => {
      mockRedisResponse(1);

      await checkRateLimit("1.2.3.4", "/uuid/configure", mockEnv);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://test-redis.upstash.io/pipeline");
      expect(options.method).toBe("POST");
      expect(options.headers.Authorization).toBe(
        "Bearer test-redis-token"
      );

      const body = JSON.parse(options.body);
      // First command: INCR
      expect(body[0][0]).toBe("INCR");
      expect(body[0][1]).toContain("ratelimit:1.2.3.4:");
      // Second command: EXPIRE with 60s TTL
      expect(body[1][0]).toBe("EXPIRE");
      expect(body[1][1]).toContain("ratelimit:1.2.3.4:");
      expect(body[1][2]).toBe("60");
    });
  });

  describe("executeRedisPipeline", () => {
    it("throws on non-OK response", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 })
      );

      await expect(
        executeRedisPipeline([["INCR", "test-key"]], mockEnv)
      ).rejects.toThrow("Upstash Redis error: 500");
    });
  });

  describe("rateLimitResponse", () => {
    it("returns HTTP 429 status", () => {
      const response = rateLimitResponse();
      expect(response.status).toBe(429);
    });

    it("returns correct error message", async () => {
      const response = rateLimitResponse();
      const body = await response.json();
      expect(body).toEqual({
        error: "Rate limit exceeded. Try again later.",
      });
    });

    it("has JSON content type", () => {
      const response = rateLimitResponse();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });
});
