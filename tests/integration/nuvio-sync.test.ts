/**
 * Integration tests for Nuvio Sync communication via the Nuvio Cloud API.
 *
 * Tests the full login → fetch watch history flow:
 * - Sign in via POST /auth/v1/token?grant_type=password
 * - Fetch watch history via POST /rest/v1/rpc/sync_pull_watched_items
 * - Error handling for auth failures, timeouts, and connection issues
 *
 * @requirements 5.2, 5.4
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWatchHistory, NuvioSyncError } from "../../src/services/nuvio-sync";

const VALID_CREDENTIALS = JSON.stringify({
  email: "user@example.com",
  password: "securepassword123",
  profile_id: 1,
});

const MOCK_AUTH_RESPONSE = {
  access_token: "eyJ-test-token",
  token_type: "bearer",
  expires_in: 3600,
  refresh_token: "refresh-abc",
  user: { id: "user-uuid", email: "user@example.com" },
};

describe("Nuvio Sync Communication Integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Successful Fetch", () => {
    it("returns parsed watch history with all fields on successful response", async () => {
      const mockWatchedItems = [
        { content_id: "tmdb:550", content_type: "movie", title: "Fight Club", season: null, episode: null, watched_at: 1711600000000 },
        { content_id: "tmdb:1396", content_type: "series", title: "Breaking Bad S01E01", season: 1, episode: 1, watched_at: 1711500000000 },
        { content_id: "tt1375666", content_type: "movie", title: "Inception", season: null, episode: null, watched_at: 1711400000000 },
      ];

      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          return new Response(JSON.stringify(mockWatchedItems), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      const result = await fetchWatchHistory(VALID_CREDENTIALS);

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe("Fight Club");
      expect(result[0].type).toBe("movie");
      expect(result[1].title).toBe("Breaking Bad S01E01");
      expect(result[1].type).toBe("series");
      expect(result[2].imdb_id).toBe("tt1375666");
    });

    it("sends correct authorization and apikey headers", async () => {
      fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          const headers = init?.headers as Record<string, string>;
          expect(headers.Authorization).toBe("Bearer eyJ-test-token");
          expect(headers.apikey).toBeDefined();
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      await fetchWatchHistory(VALID_CREDENTIALS);
    });

    it("calls the correct Nuvio API endpoints", async () => {
      const calledUrls: string[] = [];

      fetchMock.mockImplementation(async (url: string) => {
        calledUrls.push(url);
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      await fetchWatchHistory(VALID_CREDENTIALS);

      expect(calledUrls[0]).toContain("/auth/v1/token?grant_type=password");
      expect(calledUrls[1]).toContain("/rest/v1/rpc/sync_pull_watched_items");
    });

    it("returns empty array when user has no watch history", async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes("/auth/v1/token")) {
          return new Response(JSON.stringify(MOCK_AUTH_RESPONSE), { status: 200 });
        }
        if (url.includes("/rpc/sync_pull_watched_items")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response("", { status: 404 });
      });

      const result = await fetchWatchHistory(VALID_CREDENTIALS);
      expect(result).toEqual([]);
    });
  });

  describe("Authentication Failure", () => {
    it("throws NuvioSyncError with descriptive message on 401 login response", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 })
      );

      let caughtError: NuvioSyncError | null = null;
      try {
        await fetchWatchHistory(VALID_CREDENTIALS);
      } catch (error) {
        caughtError = error as NuvioSyncError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(NuvioSyncError);
      expect(caughtError!.code).toBe("NUVIO_SYNC_FAILED");
      expect(caughtError!.message).toContain("invalid Nuvio email or password");
    });

    it("throws NuvioSyncError on 400 login response", async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ error: "Bad request" }), { status: 400 })
      );

      let caughtError: NuvioSyncError | null = null;
      try {
        await fetchWatchHistory(VALID_CREDENTIALS);
      } catch (error) {
        caughtError = error as NuvioSyncError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(NuvioSyncError);
      expect(caughtError!.code).toBe("NUVIO_SYNC_FAILED");
    });

    it("throws NuvioSyncError on 500 server error during login", async () => {
      fetchMock.mockResolvedValue(
        new Response("Internal Server Error", { status: 500 })
      );

      let caughtError: NuvioSyncError | null = null;
      try {
        await fetchWatchHistory(VALID_CREDENTIALS);
      } catch (error) {
        caughtError = error as NuvioSyncError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(NuvioSyncError);
      expect(caughtError!.code).toBe("NUVIO_SYNC_FAILED");
    });
  });

  describe("Connection Timeout", () => {
    it("throws NuvioSyncError with timeout message when request is aborted", async () => {
      fetchMock.mockRejectedValue(
        new DOMException("The operation was aborted", "AbortError")
      );

      let caughtError: NuvioSyncError | null = null;
      try {
        await fetchWatchHistory(VALID_CREDENTIALS);
      } catch (error) {
        caughtError = error as NuvioSyncError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(NuvioSyncError);
      expect(caughtError!.code).toBe("NUVIO_SYNC_FAILED");
      expect(caughtError!.message).toContain("timed out");
    });

    it("throws NuvioSyncError with connection failure message on network error", async () => {
      fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

      let caughtError: NuvioSyncError | null = null;
      try {
        await fetchWatchHistory(VALID_CREDENTIALS);
      } catch (error) {
        caughtError = error as NuvioSyncError;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(NuvioSyncError);
      expect(caughtError!.code).toBe("NUVIO_SYNC_FAILED");
      expect(caughtError!.message).toContain("Failed to connect");
    });
  });
});
