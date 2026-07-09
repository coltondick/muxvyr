/**
 * Unit tests for the Nuvio Sync client.
 *
 * Tests the Nuvio Cloud API integration:
 * - Login via POST /auth/v1/token?grant_type=password
 * - Watch history fetch via POST /rest/v1/rpc/sync_pull_watched_items
 * - Error handling for auth failures, timeouts, and connection issues
 * - Watch history change detection via SHA-256 hashing
 *
 * @requirements 5.2, 5.4, 5.5
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWatchHistory,
  nuvioLogin,
  computeWatchHistoryHash,
  hasWatchHistoryChanged,
  NuvioSyncError,
  type WatchHistoryItem,
} from "../../src/services/nuvio-sync";

const MOCK_CREDENTIALS = JSON.stringify({
  email: "user@example.com",
  password: "securepassword123",
  profile_id: 1,
});

const MOCK_ACCESS_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.test-token";

const MOCK_AUTH_RESPONSE = {
  access_token: MOCK_ACCESS_TOKEN,
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "refresh-token-abc",
  user: {
    id: "user-uuid-123",
    email: "user@example.com",
  },
};

const MOCK_WATCHED_ITEMS = [
  {
    content_id: "tmdb:550",
    content_type: "movie" as const,
    title: "Fight Club",
    season: null,
    episode: null,
    watched_at: 1711600000000,
  },
  {
    content_id: "tmdb:1396",
    content_type: "series" as const,
    title: "Breaking Bad S01E01",
    season: 1,
    episode: 1,
    watched_at: 1711500000000,
  },
  {
    content_id: "tt1375666",
    content_type: "movie" as const,
    title: "Inception",
    season: null,
    episode: null,
    watched_at: 1711400000000,
  },
];

const MOCK_ENV = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("nuvio-sync", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("nuvioLogin", () => {
    it("returns session with access and refresh tokens on successful login", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_AUTH_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const session = await nuvioLogin("user@example.com", "securepassword123");

      expect(session.access_token).toBe(MOCK_ACCESS_TOKEN);
      expect(session.refresh_token).toBe("refresh-token-abc");
    });

    it("calls the correct Nuvio auth endpoint", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 })
      );

      await nuvioLogin("user@example.com", "password");

      const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("https://api.nuvio.tv/auth/v1/token?grant_type=password");
      expect(options.method).toBe("POST");
      expect(options.headers.apikey).toBe("sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN");
    });

    it("sends email and password in request body", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 })
      );

      await nuvioLogin("test@test.com", "mypassword");

      const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.email).toBe("test@test.com");
      expect(body.password).toBe("mypassword");
    });

    it("throws NuvioSyncError on 401 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
      );

      await expect(nuvioLogin("bad@email.com", "wrong"))
        .rejects.toThrow(NuvioSyncError);

      try {
        await nuvioLogin("bad@email.com", "wrong");
      } catch (error) {
        expect((error as NuvioSyncError).code).toBe("NUVIO_SYNC_FAILED");
        expect((error as NuvioSyncError).message).toContain("invalid Nuvio email or password");
      }
    });

    it("throws NuvioSyncError on 400 response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Bad request" }), { status: 400 })
      );

      try {
        await nuvioLogin("bad", "bad");
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("invalid Nuvio email or password");
      }
    });

    it("throws NuvioSyncError on timeout", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted", "AbortError")
      );

      try {
        await nuvioLogin("user@test.com", "pass");
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("timed out");
      }
    });

    it("throws NuvioSyncError on connection failure", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("Failed to fetch")
      );

      try {
        await nuvioLogin("user@test.com", "pass");
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("Failed to connect");
      }
    });
  });

  describe("fetchWatchHistory", () => {
    function mockSuccessfulFlow() {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        // Auth endpoint
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        // Watch history RPC endpoint
        if (url.includes("/rpc/sync_pull_watched_items")) {
          return new Response(JSON.stringify(MOCK_WATCHED_ITEMS), { status: 200 });
        }
        return new Response("", { status: 404 });
      });
    }

    it("returns parsed watch history on successful fetch", async () => {
      mockSuccessfulFlow();

      const result = await fetchWatchHistory(MOCK_CREDENTIALS);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe("Fight Club");
      expect(result[0].type).toBe("movie");
      expect(result[1].title).toBe("Breaking Bad S01E01");
      expect(result[1].type).toBe("series");
    });

    it("extracts IMDB ID from content_id when it starts with tt", async () => {
      mockSuccessfulFlow();

      const result = await fetchWatchHistory(MOCK_CREDENTIALS);

      // Third item has content_id "tt1375666"
      expect(result[2].imdb_id).toBe("tt1375666");
      // First item has content_id "tmdb:550" — no IMDB ID
      expect(result[0].imdb_id).toBeUndefined();
    });

    it("converts epoch milliseconds to ISO date string", async () => {
      mockSuccessfulFlow();

      const result = await fetchWatchHistory(MOCK_CREDENTIALS);

      // 1711600000000 ms = some ISO date
      expect(result[0].watched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("uses profile_id from credentials (defaults to 1)", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          const body = JSON.parse(init?.body as string);
          expect(body.p_profile_id).toBe(2);
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      const creds = JSON.stringify({ email: "a@b.com", password: "pass", profile_id: 2 });
      await fetchWatchHistory(creds);
    });

    it("sends authorization header with access token to watch history endpoint", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${MOCK_ACCESS_TOKEN}`);
          expect((init?.headers as Record<string, string>).apikey).toBe("sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN");
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      await fetchWatchHistory(MOCK_CREDENTIALS);
    });

    it("throws NuvioSyncError on invalid credentials JSON", async () => {
      try {
        await fetchWatchHistory("not-valid-json");
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("Invalid Nuvio credentials format");
      }
    });

    it("throws NuvioSyncError when email is missing", async () => {
      const badCreds = JSON.stringify({ password: "pass" });

      try {
        await fetchWatchHistory(badCreds);
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("email and password are required");
      }
    });

    it("throws NuvioSyncError when watch history endpoint returns 401", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }
        return new Response("", { status: 404 });
      });

      try {
        await fetchWatchHistory(MOCK_CREDENTIALS);
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).code).toBe("NUVIO_SYNC_FAILED");
      }
    });

    it("throws NuvioSyncError on login failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid" }), { status: 401 })
      );

      try {
        await fetchWatchHistory(MOCK_CREDENTIALS);
      } catch (error) {
        expect(error).toBeInstanceOf(NuvioSyncError);
        expect((error as NuvioSyncError).message).toContain("invalid Nuvio email or password");
      }
    });
  });

  describe("computeWatchHistoryHash", () => {
    const sampleHistory: WatchHistoryItem[] = [
      { title: "Fight Club", type: "movie", watched_at: "2024-03-28T00:00:00.000Z" },
      { title: "Breaking Bad", type: "series", watched_at: "2024-03-27T00:00:00.000Z" },
    ];

    it("produces consistent hash for the same input", async () => {
      const hash1 = await computeWatchHistoryHash(sampleHistory);
      const hash2 = await computeWatchHistoryHash(sampleHistory);

      expect(hash1).toBe(hash2);
    });

    it("produces a valid hex-encoded SHA-256 hash (64 hex chars)", async () => {
      const hash = await computeWatchHistoryHash(sampleHistory);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces different hashes for different inputs", async () => {
      const hash1 = await computeWatchHistoryHash(sampleHistory);
      const hash2 = await computeWatchHistoryHash([
        { title: "Different Movie", type: "movie", watched_at: "2024-02-01T00:00:00Z" },
      ]);

      expect(hash1).not.toBe(hash2);
    });

    it("handles empty watch history", async () => {
      const hash = await computeWatchHistoryHash([]);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("hasWatchHistoryChanged", () => {
    const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";
    const testHistory: WatchHistoryItem[] = [
      { title: "Test Movie", type: "movie", watched_at: "2024-01-01T00:00:00Z" },
    ];

    it("returns true when hash differs from stored hash", async () => {
      const storedHash = "a".repeat(64);

      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: storedHash }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: "OK" }), { status: 200 })
        );

      const result = await hasWatchHistoryChanged(TEST_UUID, testHistory, MOCK_ENV);

      expect(result).toBe(true);
    });

    it("returns false when hash matches stored hash", async () => {
      const expectedHash = await computeWatchHistoryHash(testHistory);

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ result: expectedHash }), { status: 200 })
      );

      const result = await hasWatchHistoryChanged(TEST_UUID, testHistory, MOCK_ENV);

      expect(result).toBe(false);
    });

    it("returns true when no stored hash exists (null)", async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: null }), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ result: "OK" }), { status: 200 })
        );

      const result = await hasWatchHistoryChanged(TEST_UUID, testHistory, MOCK_ENV);

      expect(result).toBe(true);
    });

    it("uses correct Redis key format watchhist:{uuid}:hash", async () => {
      const expectedHash = await computeWatchHistoryHash(testHistory);

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ result: expectedHash }), { status: 200 })
      );

      await hasWatchHistoryChanged(TEST_UUID, testHistory, MOCK_ENV);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      expect(url).toContain(`/get/${encodeURIComponent(`watchhist:${TEST_UUID}:hash`)}`);
    });
  });

  describe("NuvioSyncError", () => {
    it("has correct name and code properties", () => {
      const error = new NuvioSyncError("Test error", "NUVIO_SYNC_FAILED");

      expect(error.name).toBe("NuvioSyncError");
      expect(error.code).toBe("NUVIO_SYNC_FAILED");
      expect(error.message).toBe("Test error");
      expect(error).toBeInstanceOf(Error);
    });

    it("defaults code to NUVIO_SYNC_FAILED when not provided", () => {
      const error = new NuvioSyncError("Some failure");

      expect(error.code).toBe("NUVIO_SYNC_FAILED");
    });
  });
});
