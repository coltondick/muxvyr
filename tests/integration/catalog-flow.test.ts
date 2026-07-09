/**
 * Integration tests for the full catalog flow.
 *
 * Simulates: Stremio catalog request → cache miss → config fetch → Nuvio sync →
 * AI recommendation → metadata resolution → cache write → response.
 *
 * @requirements 10.1, 10.2, 10.3, 11.4, 12.1
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCatalog } from "../../src/handlers/catalog";
import type { WorkerEnv } from "../../src/index";

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY,
};

/**
 * Helper to encrypt a string for mock config storage.
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

describe("Catalog Flow Integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes full pipeline on cache miss and returns Stremio-compliant response", async () => {
    const encryptedApiKey = await encryptValue("sk-test-api-key-12345");
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

    const mockWatchHistory = [
      { title: "Inception", type: "movie", imdb_id: "tt1375666", year: 2010, watched_at: "2024-01-15T10:30:00Z" },
      { title: "Breaking Bad", type: "series", imdb_id: "tt0903747", year: 2008, watched_at: "2024-01-14T20:00:00Z" },
    ];

    const aiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify([
              { title: "Interstellar", type: "movie", year: 2014, reason: "Similar sci-fi" },
              { title: "The Dark Knight", type: "movie", year: 2008, reason: "Same director" },
            ]),
          },
        },
      ],
    };

    // Metadata API responses for TMDB
    const tmdbSearchInterstellar = { results: [{ id: 157336, title: "Interstellar" }] };
    const tmdbDetailsInterstellar = {
      id: 157336,
      title: "Interstellar",
      imdb_id: "tt0816692",
      poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      overview: "A team of explorers travel through a wormhole in space.",
      release_date: "2014-11-07",
      vote_average: 8.6,
    };
    const tmdbSearchDarkKnight = { results: [{ id: 155, title: "The Dark Knight" }] };
    const tmdbDetailsDarkKnight = {
      id: 155,
      title: "The Dark Knight",
      imdb_id: "tt0468569",
      poster_path: "/qJ2tW6WMUDux911BTUOrgT3sCAz.jpg",
      overview: "Batman raises the stakes in his war on crime.",
      release_date: "2008-07-18",
      vote_average: 9.0,
    };

    // Setup fetch mock to route calls based on URL
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      // Redis GET (cache miss)
      if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        if (body[0] === "GET") {
          return new Response(JSON.stringify({ result: null }), { status: 200 });
        }
        if (body[0] === "SET") {
          return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
        }
      }

      // Supabase config fetch
      if (urlStr.includes("supabase.co") && urlStr.includes("user_configurations")) {
        return new Response(JSON.stringify([mockConfig]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Nuvio Sync: auth endpoint returns token, RPC endpoint returns watch history
      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/auth/")) {
        return new Response(JSON.stringify({
          access_token: "test-token",
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "refresh",
          user: { id: "uuid", email: "user@test.com" },
        }), { status: 200 });
      }
      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/rpc/sync_pull_watched_items")) {
        return new Response(JSON.stringify(mockWatchHistory.map(item => ({
          content_id: item.imdb_id || `tmdb:${item.title.replace(/\s/g, "")}`,
          content_type: item.type,
          title: item.title,
          season: null,
          episode: null,
          watched_at: new Date(item.watched_at).getTime(),
        }))), { status: 200 });
      }

      // OpenAI API
      if (urlStr.includes("api.openai.com")) {
        return new Response(JSON.stringify(aiResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // TMDB search/details (metadata resolution)
      if (urlStr.includes("api.themoviedb.org") && urlStr.includes("search")) {
        if (urlStr.includes("Interstellar")) {
          return new Response(JSON.stringify(tmdbSearchInterstellar), { status: 200 });
        }
        if (urlStr.includes("Dark") || urlStr.includes("Knight")) {
          return new Response(JSON.stringify(tmdbSearchDarkKnight), { status: 200 });
        }
        return new Response(JSON.stringify({ results: [] }), { status: 200 });
      }
      if (urlStr.includes("api.themoviedb.org") && urlStr.includes("/movie/157336")) {
        return new Response(JSON.stringify(tmdbDetailsInterstellar), { status: 200 });
      }
      if (urlStr.includes("api.themoviedb.org") && urlStr.includes("/movie/155")) {
        return new Response(JSON.stringify(tmdbDetailsDarkKnight), { status: 200 });
      }

      // Default fallback for metadata sources that don't match
      return new Response(JSON.stringify({ results: [] }), { status: 404 });
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

    const body = await response.json() as { metas: Array<{ id: string; type: string; name: string; poster: string }> };

    // Verify Stremio protocol-compliant response
    expect(body).toHaveProperty("metas");
    expect(Array.isArray(body.metas)).toBe(true);

    // Each meta should have required fields
    for (const meta of body.metas) {
      expect(meta).toHaveProperty("id");
      expect(meta).toHaveProperty("type");
      expect(meta).toHaveProperty("name");
      expect(meta).toHaveProperty("poster");
    }
  });

  it("verifies cache SET is called after successful catalog generation", async () => {
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

    const redisCalls: string[][] = [];

    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        redisCalls.push(body);
        if (body[0] === "GET") {
          return new Response(JSON.stringify({ result: null }), { status: 200 });
        }
        if (body[0] === "SET") {
          return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
        }
      }

      if (urlStr.includes("supabase.co")) {
        return new Response(JSON.stringify([mockConfig]), { status: 200 });
      }

      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/auth/")) {
        return new Response(JSON.stringify({
          access_token: "test-token", token_type: "bearer", expires_in: 3600,
          refresh_token: "r", user: { id: "u", email: "user@test.com" },
        }), { status: 200 });
      }
      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/rpc/")) {
        return new Response(JSON.stringify([
          { content_id: "tmdb:123", content_type: "movie", title: "Test Movie", season: null, episode: null, watched_at: 1704067200000 },
        ]), { status: 200 });
      }

      if (urlStr.includes("api.openai.com")) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify([
            { title: "Recommended Movie", type: "movie", year: 2023 },
          ]) } }],
        }), { status: 200 });
      }

      // Metadata sources - return empty to simplify (titles will be omitted)
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

    // Verify Redis SET was called (cache write)
    const setCalls = redisCalls.filter((call) => call[0] === "SET");
    expect(setCalls.length).toBeGreaterThanOrEqual(1);

    // Verify the SET key matches catalog pattern
    const catalogSetCall = setCalls.find((call) =>
      call[1].startsWith(`catalog:${TEST_UUID}:`)
    );
    expect(catalogSetCall).toBeDefined();
  });

  it("returns empty catalog with metas array on AI provider failure", async () => {
    const encryptedApiKey = await encryptValue("sk-bad-key");
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

    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes("test-redis.upstash.io")) {
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }

      if (urlStr.includes("supabase.co")) {
        return new Response(JSON.stringify([mockConfig]), { status: 200 });
      }

      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/auth/")) {
        return new Response(JSON.stringify({
          access_token: "test-token", token_type: "bearer", expires_in: 3600,
          refresh_token: "r", user: { id: "u", email: "user@test.com" },
        }), { status: 200 });
      }
      if (urlStr.includes("api.nuvio.tv") && urlStr.includes("/rpc/")) {
        return new Response(JSON.stringify([
          { content_id: "tmdb:123", content_type: "movie", title: "Test", season: null, episode: null, watched_at: 1704067200000 },
        ]), { status: 200 });
      }

      // AI provider returns error
      if (urlStr.includes("api.openai.com")) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 });
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
    const body = await response.json() as { metas: unknown[] };
    expect(body).toHaveProperty("metas");
    expect(body.metas).toEqual([]);
  });

  it("returns 404 for non-existent UUID configuration", async () => {
    fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr.includes("test-redis.upstash.io")) {
        return new Response(JSON.stringify({ result: null }), { status: 200 });
      }

      if (urlStr.includes("supabase.co")) {
        return new Response(JSON.stringify([]), { status: 200 });
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

    expect(response.status).toBe(404);
  });
});
