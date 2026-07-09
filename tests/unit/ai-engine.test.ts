/**
 * Unit tests for AI Recommendation Engine Orchestrator
 *
 * Tests the orchestrator for:
 * - Correct provider selection based on context
 * - Prompt building with all context fields
 * - Returns recommendations on success
 * - Returns null when adapter returns null (error/timeout)
 * - Works for all three providers (gemini, openai, grok)
 *
 * @requirements 10.2, 10.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateRecommendations, RecommendationContext } from "../../src/services/ai-engine";
import type { WatchHistoryItem } from "../../src/services/nuvio-sync";
import type { RecommendedTitle } from "../../src/services/ai-providers/types";

// Mock Redis to prevent connection attempts in unit tests
vi.mock("../../src/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null),
    setex: vi.fn(async () => "OK"),
    set: vi.fn(async () => "OK"),
    del: vi.fn(async () => 1),
    ping: vi.fn(async () => "PONG"),
  },
}));

const MOCK_WATCH_HISTORY: WatchHistoryItem[] = [
  { title: "Inception", type: "movie", year: 2010, watched_at: "2024-01-01T00:00:00Z" },
  { title: "Breaking Bad", type: "series", year: 2008, watched_at: "2024-01-02T00:00:00Z" },
  { title: "The Matrix", type: "movie", year: 1999, watched_at: "2024-01-03T00:00:00Z" },
];

const MOCK_RECOMMENDATIONS: RecommendedTitle[] = [
  { title: "Interstellar", type: "movie", year: 2014, reason: "Sci-fi epic" },
  { title: "Dark", type: "series", year: 2017, reason: "Mind-bending thriller" },
];

function createBaseContext(
  overrides?: Partial<RecommendationContext>
): RecommendationContext {
  return {
    provider: "openai",
    apiKey: "test-api-key-12345",
    watchHistory: MOCK_WATCH_HISTORY,
    languages: ["en"],
    catalogType: "general",
    ...overrides,
  };
}

describe("AI Recommendation Engine Orchestrator", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("provider selection", () => {
    it("selects Gemini adapter when provider is 'gemini'", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } },
            ],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "gemini" });
      await generateRecommendations(context);

      expect(capturedUrl).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
      );
    });

    it("selects OpenAI adapter when provider is 'openai'", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "openai" });
      await generateRecommendations(context);

      expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("selects Grok adapter when provider is 'grok'", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "grok" });
      await generateRecommendations(context);

      expect(capturedUrl).toBe("https://api.x.ai/v1/chat/completions");
    });
  });

  describe("prompt building", () => {
    it("builds prompt with watch history titles", async () => {
      let capturedBody = "";
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "openai" });
      await generateRecommendations(context);

      const body = JSON.parse(capturedBody);
      const prompt = body.messages[0].content;
      expect(prompt).toContain("Inception");
      expect(prompt).toContain("Breaking Bad");
      expect(prompt).toContain("The Matrix");
    });

    it("builds prompt with language selection", async () => {
      let capturedBody = "";
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ languages: ["en", "fr", "de"] });
      await generateRecommendations(context);

      const body = JSON.parse(capturedBody);
      const prompt = body.messages[0].content;
      expect(prompt).toContain("en, fr, de");
    });

    it("builds prompt with all optional context fields", async () => {
      let capturedBody = "";
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({
        fineTuningParams: "Prefer recent releases from 2020+",
        countryFilter: ["US", "UK"],
        genreExclusions: ["Horror", "Romance"],
        genrePreferences: ["Sci-Fi", "Thriller"],
      });
      await generateRecommendations(context);

      const body = JSON.parse(capturedBody);
      const prompt = body.messages[0].content;
      expect(prompt).toContain("Prefer recent releases from 2020+");
      expect(prompt).toContain("US, UK");
      expect(prompt).toContain("Horror, Romance");
      expect(prompt).toContain("Sci-Fi, Thriller");
    });

    it("builds prompt for because-you-watched catalog type", async () => {
      let capturedBody = "";
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({
        catalogType: "because-you-watched",
        referenceTitleForByw: "Inception",
      });
      await generateRecommendations(context);

      const body = JSON.parse(capturedBody);
      const prompt = body.messages[0].content;
      expect(prompt).toContain('REFERENCE TITLE: "Inception"');
    });
  });

  describe("success cases", () => {
    it("returns recommendations on successful AI response", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext();
      const result = await generateRecommendations(context);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("works with gemini provider and returns recommendations", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } },
            ],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "gemini" });
      const result = await generateRecommendations(context);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("works with grok provider and returns recommendations", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({ provider: "grok" });
      const result = await generateRecommendations(context);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });
  });

  describe("error handling", () => {
    it("returns null when adapter returns null (HTTP error)", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Unauthorized", { status: 401 });
      });

      const context = createBaseContext();
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });

    it("returns null when adapter returns null (network error)", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("Network failure");
      });

      const context = createBaseContext();
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });

    it("returns null when adapter returns null (timeout/abort)", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      });

      const context = createBaseContext();
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });

    it("returns null when adapter returns null (invalid response)", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "not valid json" } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext();
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });

    it("returns null for gemini provider on error", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Server Error", { status: 500 });
      });

      const context = createBaseContext({ provider: "gemini" });
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });

    it("returns null for grok provider on error", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Rate limited", { status: 429 });
      });

      const context = createBaseContext({ provider: "grok" });
      const result = await generateRecommendations(context);

      expect(result).toBeNull();
    });
  });

  describe("API key usage", () => {
    it("passes the API key to the provider adapter", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({
        provider: "openai",
        apiKey: "sk-test-key-secret",
      });
      await generateRecommendations(context);

      expect(capturedHeaders).toHaveProperty("Authorization", "Bearer sk-test-key-secret");
    });

    it("passes the API key via x-goog-api-key for Gemini", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } },
            ],
          }),
          { status: 200 }
        );
      });

      const context = createBaseContext({
        provider: "gemini",
        apiKey: "AIza-test-gemini-key",
      });
      await generateRecommendations(context);

      expect(capturedHeaders).toHaveProperty("x-goog-api-key", "AIza-test-gemini-key");
    });
  });
});
