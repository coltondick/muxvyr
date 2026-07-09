/**
 * Unit tests for the Cache Service
 *
 * Tests all cache operations (getCatalog, setCatalog, getMetadata, setMetadata, invalidateUser)
 * by mocking the global fetch function to simulate Upstash Redis REST API responses.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCatalog,
  setCatalog,
  getMetadata,
  setMetadata,
  invalidateUser,
  redisCommand,
  CATALOG_TTL_SECONDS,
  METADATA_TTL_SECONDS,
} from "../../src/services/cache";
import type { WorkerEnv } from "../../src/index";
import type { StremioMetaPreview } from "../../src/services/metadata-resolver";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY: "0".repeat(64),
};

const sampleMeta: StremioMetaPreview = {
  id: "tt1234567",
  type: "movie",
  name: "Test Movie",
  poster: "https://example.com/poster.jpg",
  description: "A test movie",
  releaseInfo: "2024",
  imdbRating: "8.5",
};

const sampleCatalog: StremioMetaPreview[] = [
  sampleMeta,
  {
    id: "tt7654321",
    type: "series",
    name: "Test Series",
    poster: "https://example.com/poster2.jpg",
    description: "A test series",
  },
];

describe("Cache Service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("redisCommand", () => {
    it("sends correct request to Upstash Redis REST API", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await redisCommand(["SET", "key", "value"], mockEnv);

      expect(fetchMock).toHaveBeenCalledWith(
        "https://test-redis.upstash.io",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-redis-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(["SET", "key", "value"]),
        }
      );
    });

    it("throws on non-OK response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(
        redisCommand(["GET", "key"], mockEnv)
      ).rejects.toThrow("Upstash Redis error: 401");
    });
  });

  describe("getCatalog", () => {
    it("returns cached data when present", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: JSON.stringify(sampleCatalog) }),
      });

      const result = await getCatalog("test-uuid", "ai-recommendations-movie", mockEnv);

      expect(result).toEqual(sampleCatalog);
    });

    it("returns null on cache miss (null result)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      const result = await getCatalog("test-uuid", "ai-recommendations-movie", mockEnv);

      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await getCatalog("test-uuid", "ai-recommendations-movie", mockEnv);

      expect(result).toBeNull();
    });

    it("uses correct key pattern catalog:{uuid}:{catalogId}", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      await getCatalog("my-uuid-123", "byw-movie-tt999", mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual(["GET", "catalog:my-uuid-123:byw-movie-tt999"]);
    });
  });

  describe("setCatalog", () => {
    it("stores data with correct TTL (default 6 hours)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setCatalog("test-uuid", "ai-recommendations-movie", sampleCatalog, mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual([
        "SET",
        "catalog:test-uuid:ai-recommendations-movie",
        JSON.stringify(sampleCatalog),
        "EX",
        String(CATALOG_TTL_SECONDS),
      ]);
    });

    it("uses custom TTL when provided", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setCatalog("test-uuid", "catalog-id", sampleCatalog, mockEnv, 3600);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual([
        "SET",
        "catalog:test-uuid:catalog-id",
        JSON.stringify(sampleCatalog),
        "EX",
        "3600",
      ]);
    });

    it("uses correct key pattern", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setCatalog("abc-def", "my-catalog", [], mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body[1]).toBe("catalog:abc-def:my-catalog");
    });
  });

  describe("getMetadata", () => {
    it("returns cached metadata when present", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: JSON.stringify(sampleMeta) }),
      });

      const result = await getMetadata("tt1234567", mockEnv);

      expect(result).toEqual(sampleMeta);
    });

    it("returns null on cache miss", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      const result = await getMetadata("tt9999999", mockEnv);

      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await getMetadata("tt1234567", mockEnv);

      expect(result).toBeNull();
    });

    it("uses correct key pattern meta:{imdbId}", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      await getMetadata("tt5555555", mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual(["GET", "meta:tt5555555"]);
    });
  });

  describe("setMetadata", () => {
    it("stores metadata with correct TTL (default 24 hours)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setMetadata("tt1234567", sampleMeta, mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual([
        "SET",
        "meta:tt1234567",
        JSON.stringify(sampleMeta),
        "EX",
        String(METADATA_TTL_SECONDS),
      ]);
    });

    it("uses custom TTL when provided", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setMetadata("tt1234567", sampleMeta, mockEnv, 7200);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body).toEqual([
        "SET",
        "meta:tt1234567",
        JSON.stringify(sampleMeta),
        "EX",
        "7200",
      ]);
    });

    it("uses correct key pattern", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: "OK" }),
      });

      await setMetadata("tt9876543", sampleMeta, mockEnv);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body[1]).toBe("meta:tt9876543");
    });
  });

  describe("invalidateUser", () => {
    it("deletes all user catalog keys found by SCAN", async () => {
      // First SCAN returns some keys
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: ["0", ["catalog:user-1:movie", "catalog:user-1:series"]],
        }),
      });

      // DEL command
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 2 }),
      });

      await invalidateUser("user-1", mockEnv);

      // Verify SCAN was called with correct pattern
      const scanBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(scanBody).toEqual(["SCAN", "0", "MATCH", "catalog:user-1:*", "COUNT", "100"]);

      // Verify DEL was called with the found keys
      const delBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(delBody).toEqual(["DEL", "catalog:user-1:movie", "catalog:user-1:series"]);
    });

    it("handles multiple SCAN iterations", async () => {
      // First SCAN returns cursor != 0, meaning more keys to scan
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: ["42", ["catalog:user-2:catalog-a"]],
        }),
      });

      // DEL first batch
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 1 }),
      });

      // Second SCAN returns cursor 0, done
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: ["0", ["catalog:user-2:catalog-b"]],
        }),
      });

      // DEL second batch
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 1 }),
      });

      await invalidateUser("user-2", mockEnv);

      expect(fetchMock).toHaveBeenCalledTimes(4);

      // Second SCAN should use cursor from first SCAN
      const secondScanBody = JSON.parse(fetchMock.mock.calls[2][1].body);
      expect(secondScanBody).toEqual(["SCAN", "42", "MATCH", "catalog:user-2:*", "COUNT", "100"]);
    });

    it("handles no keys found", async () => {
      // SCAN returns empty array
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: ["0", []],
        }),
      });

      await invalidateUser("user-no-cache", mockEnv);

      // Should only call SCAN once, no DEL
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("uses correct pattern with user UUID", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: ["0", []],
        }),
      });

      await invalidateUser("abc-123-def-456", mockEnv);

      const scanBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(scanBody[3]).toBe("catalog:abc-123-def-456:*");
    });
  });

  describe("Authentication", () => {
    it("uses Bearer token auth for all requests", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      await getCatalog("uuid", "catalog", mockEnv);

      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer test-redis-token"
      );
    });

    it("connects to the configured Upstash Redis URL (TLS)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: null }),
      });

      await getMetadata("tt123", mockEnv);

      expect(fetchMock.mock.calls[0][0]).toBe("https://test-redis.upstash.io");
    });
  });
});
