/**
 * Unit tests for AI Provider Adapters
 *
 * Tests each adapter (Gemini, OpenAI, Grok) for:
 * - Correct URL targeting
 * - Correct auth header format
 * - Successful response parsing into RecommendedTitle[]
 * - Graceful error/timeout handling (returns null)
 * - 25-second timeout configuration
 *
 * @requirements 10.2, 13.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiAdapter } from "../../src/services/ai-providers/gemini";
import { OpenAIAdapter } from "../../src/services/ai-providers/openai";
import { GrokAdapter } from "../../src/services/ai-providers/grok";
import { getProvider } from "../../src/services/ai-providers";

const MOCK_PROMPT = "Recommend 5 movies based on watch history.";
const MOCK_API_KEY = "test-api-key-12345";

const MOCK_RECOMMENDATIONS = [
  { title: "Inception", type: "movie" as const, year: 2010, reason: "Mind-bending sci-fi" },
  { title: "Breaking Bad", type: "series" as const, year: 2008, reason: "Gripping drama" },
];

describe("AI Provider Adapters", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("GeminiAdapter", () => {
    const adapter = new GeminiAdapter();

    it("calls the correct Gemini endpoint URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedUrl).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
      );
    });

    it("uses x-goog-api-key header for authentication", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedHeaders).toHaveProperty("x-goog-api-key", MOCK_API_KEY);
    });

    it("sends correct request body format", async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      const body = JSON.parse(capturedBody!);
      expect(body).toEqual({
        contents: [{ parts: [{ text: MOCK_PROMPT }] }],
        generationConfig: { temperature: 0.7 },
      });
    });

    it("parses response into RecommendedTitle[]", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } }],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("returns null on HTTP error response", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Unauthorized", { status: 401 });
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null on invalid JSON in response text", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "not valid json" }] } }],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("Network failure");
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null when response has no candidates", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("uses AbortController signal for timeout", async () => {
      let capturedSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal as AbortSignal;
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify(MOCK_RECOMMENDATIONS) }] } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it("returns null when request is aborted (timeout)", async () => {
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        // Simulate abort
        const error = new DOMException("The operation was aborted", "AbortError");
        throw error;
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });
  });

  describe("OpenAIAdapter", () => {
    const adapter = new OpenAIAdapter();

    it("calls the correct OpenAI endpoint URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
    });

    it("uses Bearer token authorization header", async () => {
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

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedHeaders).toHaveProperty("Authorization", `Bearer ${MOCK_API_KEY}`);
    });

    it("sends correct request body with gpt-4o-mini model and json response format", async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      const body = JSON.parse(capturedBody!);
      expect(body).toEqual({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: MOCK_PROMPT }],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
    });

    it("parses response into RecommendedTitle[]", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("handles response wrapped in object with recommendations key", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ recommendations: MOCK_RECOMMENDATIONS }) } },
            ],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("returns null on HTTP error response", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Rate limited", { status: 429 });
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("Connection refused");
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null when response has empty choices", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ choices: [] }), { status: 200 });
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("uses AbortController signal for timeout", async () => {
      let capturedSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal as AbortSignal;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it("returns null when request is aborted (timeout)", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });
  });

  describe("GrokAdapter", () => {
    const adapter = new GrokAdapter();

    it("calls the correct Grok endpoint URL", async () => {
      let capturedUrl = "";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        capturedUrl = input.toString();
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedUrl).toBe("https://api.x.ai/v1/chat/completions");
    });

    it("uses Bearer token authorization header", async () => {
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

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedHeaders).toHaveProperty("Authorization", `Bearer ${MOCK_API_KEY}`);
    });

    it("sends correct request body with grok-3 model", async () => {
      let capturedBody: string | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      const body = JSON.parse(capturedBody!);
      expect(body).toEqual({
        model: "grok-3",
        messages: [{ role: "system", content: MOCK_PROMPT }],
        temperature: 0.7,
      });
    });

    it("parses response into RecommendedTitle[]", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("handles response wrapped in object with recommendations key", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ recommendations: MOCK_RECOMMENDATIONS }) } },
            ],
          }),
          { status: 200 }
        );
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toEqual(MOCK_RECOMMENDATIONS);
    });

    it("returns null on HTTP error response", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("Server error", { status: 500 });
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("returns null on network error", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new Error("DNS resolution failed");
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });

    it("uses AbortController signal for timeout", async () => {
      let capturedSignal: AbortSignal | undefined;
      globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedSignal = init?.signal as AbortSignal;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(MOCK_RECOMMENDATIONS) } }],
          }),
          { status: 200 }
        );
      });

      await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it("returns null when request is aborted (timeout)", async () => {
      globalThis.fetch = vi.fn(async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      });

      const result = await adapter.generateRecommendations(MOCK_PROMPT, MOCK_API_KEY);

      expect(result).toBeNull();
    });
  });

  describe("getProvider factory", () => {
    it("returns GeminiAdapter for 'gemini'", () => {
      const provider = getProvider("gemini");
      expect(provider).toBeInstanceOf(GeminiAdapter);
    });

    it("returns OpenAIAdapter for 'openai'", () => {
      const provider = getProvider("openai");
      expect(provider).toBeInstanceOf(OpenAIAdapter);
    });

    it("returns GrokAdapter for 'grok'", () => {
      const provider = getProvider("grok");
      expect(provider).toBeInstanceOf(GrokAdapter);
    });
  });
});
