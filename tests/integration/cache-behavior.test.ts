/**
 * Integration tests for cache behavior.
 *
 * Tests:
 * - Cache hit returns without AI call
 * - Cache miss triggers full pipeline
 * - Config update invalidates cache
 * - Watch history change invalidates cache
 *
 * @requirements 12.1, 12.2, 12.3, 5.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCatalog } from "../../src/handlers/catalog";
import { handlePostConfigure } from "../../src/handlers/configure";
import { hasWatchHistoryChanged } from "../../src/services/nuvio-sync";
import type { WorkerEnv } from "../../src/index";

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY,
};

/**
 * Helper to encrypt a value for mock config storage.
 */
async function encryptValue(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const keyBuffer = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBuffer[i] = parseInt(ENCRYPTION_KEY.substring(i * 2, i * 2 + 2), 16);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plaintext)
  );
  const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  return { ciphertext, iv: ivBase64 };
}

const cachedMetas = [
  {
    id: "tt1234567",
    type: "movie" as const,
    name: "Cached Movie",
    poster: "https://example.com/poster.jpg",
    description: "A cached movie",
  },
  {
    id: "tt7654321",
    type: "movie" as const,
    name: "Another Cached Movie",
    poster: "https://example.com/poster2.jpg",
  },
];

describe("Cache Behavior Integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Cache Hit", () => {
    it("returns cached catalog without calling AI provider", async () => {
      let aiProviderCalled = false;

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        // Redis GET — cache HIT (return cached data)
        if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
          const body = JSON.parse(init.body as string);
          if (body[0] === "GET") {
            return new Response(
              JSON.stringify({ result: JSON.stringify(cachedMetas) }),
              { status: 200 }
            );
          }
        }

        // AI provider should NOT be called
        if (urlStr.includes("api.openai.com") || urlStr.includes("generativelanguage.googleapis.com") || urlStr.includes("api.x.ai")) {
          aiProviderCalled = true;
          return new Response(JSON.stringify({ choices: [] }), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const request = new Request(
        `https://muxvyr.com/${TEST_UUID}/catalog/movie/ai-recommendations-movie.json`,
        { method: "GET" }
      );

      const response = await handleCatalog(request, mockEnv, {
        uuid: TEST_UUID,
        type: "movie",
        id: "ai-recommendations-movie",
      });

      expect(response.status).toBe(200);
      const body = await response.json() as { metas: typeof cachedMetas };

      // Should return cached data
      expect(body.metas).toHaveLength(2);
      expect(body.metas[0].name).toBe("Cached Movie");
      expect(body.metas[1].name).toBe("Another Cached Movie");

      // AI provider should never have been called
      expect(aiProviderCalled).toBe(false);
    });

    it("does not call Supabase or Nuvio on cache hit", async () => {
      let supabaseCalled = false;
      let nuvioCalled = false;

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
          const body = JSON.parse(init.body as string);
          if (body[0] === "GET") {
            return new Response(
              JSON.stringify({ result: JSON.stringify(cachedMetas) }),
              { status: 200 }
            );
          }
        }

        if (urlStr.includes("supabase.co")) {
          supabaseCalled = true;
          return new Response(JSON.stringify([]), { status: 200 });
        }

        if (urlStr.includes("api.nuvio.tv")) {
          nuvioCalled = true;
          return new Response(JSON.stringify([]), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const request = new Request(
        `https://muxvyr.com/${TEST_UUID}/catalog/movie/ai-recommendations-movie.json`,
        { method: "GET" }
      );

      await handleCatalog(request, mockEnv, {
        uuid: TEST_UUID,
        type: "movie",
        id: "ai-recommendations-movie",
      });

      expect(supabaseCalled).toBe(false);
      expect(nuvioCalled).toBe(false);
    });
  });

  describe("Cache Miss", () => {
    it("triggers full pipeline: config fetch → Nuvio → AI → metadata → cache write", async () => {
      const encryptedApiKey = await encryptValue("sk-test-key");
      const encryptedNuvio = await encryptValue(JSON.stringify({ email: "user@test.com", password: "pass123" }));

      const mockConfig = {
        uuid: TEST_UUID,
        ai_provider: "openai",
        encrypted_api_key: encryptedApiKey.ciphertext,
        api_key_iv: encryptedApiKey.iv,
        languages: ["en"],
        nuvio_credentials: encryptedNuvio.ciphertext,
        nuvio_credentials_iv: encryptedNuvio.iv,
        fine_tuning_params: null,
        country_filter: null,
        genre_exclusions: null,
        genre_preferences: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      let supabaseCalled = false;
      let nuvioCalled = false;
      let aiCalled = false;
      let cacheWriteCalled = false;

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        // Redis — cache MISS on GET, accept SET
        if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
          const body = JSON.parse(init.body as string);
          if (body[0] === "GET") {
            return new Response(JSON.stringify({ result: null }), { status: 200 });
          }
          if (body[0] === "SET") {
            cacheWriteCalled = true;
            return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
          }
        }

        // Supabase config fetch
        if (urlStr.includes("supabase.co") && urlStr.includes("user_configurations")) {
          supabaseCalled = true;
          return new Response(JSON.stringify([mockConfig]), { status: 200 });
        }

        // Nuvio auth + watch history
        if (urlStr.includes("api.nuvio.tv")) {
          nuvioCalled = true;
          if (urlStr.includes("/auth/")) {
            return new Response(JSON.stringify({
              access_token: "test-token", token_type: "bearer", expires_in: 3600,
              refresh_token: "r", user: { id: "u", email: "user@test.com" },
            }), { status: 200 });
          }
          return new Response(JSON.stringify([
            { content_id: "tt1375666", content_type: "movie", title: "Inception", season: null, episode: null, watched_at: 1705312200000 },
          ]), { status: 200 });
        }

        // AI provider
        if (urlStr.includes("api.openai.com")) {
          aiCalled = true;
          return new Response(JSON.stringify({
            choices: [{ message: { content: JSON.stringify([
              { title: "Interstellar", type: "movie", year: 2014 },
            ]) } }],
          }), { status: 200 });
        }

        // Metadata sources — return 404 to simplify
        return new Response(JSON.stringify({ results: [] }), { status: 404 });
      });

      const request = new Request(
        `https://muxvyr.com/${TEST_UUID}/catalog/movie/ai-recommendations-movie.json`,
        { method: "GET" }
      );

      await handleCatalog(request, mockEnv, {
        uuid: TEST_UUID,
        type: "movie",
        id: "ai-recommendations-movie",
      });

      // All pipeline stages should have been called
      expect(supabaseCalled).toBe(true);
      expect(nuvioCalled).toBe(true);
      expect(aiCalled).toBe(true);
      expect(cacheWriteCalled).toBe(true);
    });
  });

  describe("Config Update Invalidates Cache", () => {
    it("triggers SCAN-based cache invalidation on successful config update", async () => {
      const encryptedApiKey = await encryptValue("sk-old-key");
      const encryptedNuvio = await encryptValue(JSON.stringify({ email: "user@test.com", password: "oldpass" }));

      const existingConfig = {
        uuid: TEST_UUID,
        ai_provider: "openai",
        encrypted_api_key: encryptedApiKey.ciphertext,
        api_key_iv: encryptedApiKey.iv,
        languages: ["en"],
        nuvio_credentials: encryptedNuvio.ciphertext,
        nuvio_credentials_iv: encryptedNuvio.iv,
        fine_tuning_params: null,
        country_filter: null,
        genre_exclusions: null,
        genre_preferences: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const redisCalls: string[][] = [];

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("supabase.co") && init?.method === "GET") {
          return new Response(JSON.stringify([existingConfig]), { status: 200 });
        }

        if (urlStr.includes("supabase.co") && init?.method === "PATCH") {
          return new Response(JSON.stringify([{ ...existingConfig, ai_provider: "gemini" }]), { status: 200 });
        }

        if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
          const body = JSON.parse(init.body as string);
          redisCalls.push(body);
          if (body[0] === "SCAN") {
            // Return some existing cache keys to delete
            return new Response(
              JSON.stringify({ result: ["0", [`catalog:${TEST_UUID}:ai-recommendations-movie`]] }),
              { status: 200 }
            );
          }
          if (body[0] === "DEL") {
            return new Response(JSON.stringify({ result: 1 }), { status: 200 });
          }
          return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const request = new Request(`https://muxvyr.com/${TEST_UUID}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_provider: "gemini",
          api_key: "AIzaSy-new-key",
          languages: ["en"],
          nuvio_credentials: "nuvio-new",
        }),
      });

      const response = await handlePostConfigure(request, mockEnv, { uuid: TEST_UUID });
      expect(response.status).toBe(200);

      // Verify SCAN was called for cache invalidation
      const scanCalls = redisCalls.filter((c) => c[0] === "SCAN");
      expect(scanCalls.length).toBeGreaterThanOrEqual(1);
      expect(scanCalls[0][3]).toBe(`catalog:${TEST_UUID}:*`);

      // Verify DEL was called to remove found keys
      const delCalls = redisCalls.filter((c) => c[0] === "DEL");
      expect(delCalls.length).toBe(1);
      expect(delCalls[0]).toContain(`catalog:${TEST_UUID}:ai-recommendations-movie`);
    });
  });

  describe("Watch History Change Detection", () => {
    it("detects watch history change when hash differs from stored", async () => {
      const watchHistory = [
        { title: "New Movie", type: "movie" as const, watched_at: "2024-02-01T00:00:00Z" },
      ];

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("test-redis.upstash.io")) {
          // First call: GET stored hash — return different hash
          if (urlStr.includes("/get/")) {
            return new Response(
              JSON.stringify({ result: "aaaa".repeat(16) }),
              { status: 200 }
            );
          }
          // Second call: SET new hash
          if (urlStr.includes("/set/")) {
            return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
          }
        }

        return new Response("", { status: 404 });
      });

      const changed = await hasWatchHistoryChanged(TEST_UUID, watchHistory, mockEnv);
      expect(changed).toBe(true);
    });

    it("detects no change when hash matches stored hash", async () => {
      const watchHistory = [
        { title: "Same Movie", type: "movie" as const, watched_at: "2024-01-01T00:00:00Z" },
      ];

      // Pre-compute the hash for this exact watch history
      const serialized = JSON.stringify(watchHistory);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(serialized));
      const expectedHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      fetchMock.mockImplementation(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("test-redis.upstash.io") && urlStr.includes("/get/")) {
          return new Response(
            JSON.stringify({ result: expectedHash }),
            { status: 200 }
          );
        }

        return new Response("", { status: 404 });
      });

      const changed = await hasWatchHistoryChanged(TEST_UUID, watchHistory, mockEnv);
      expect(changed).toBe(false);
    });
  });
});
