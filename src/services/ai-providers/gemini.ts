/**
 * Gemini AI Provider Adapter
 *
 * @module ai-providers/gemini
 */

import type { AIProviderAdapter, RecommendedTitle } from "./types.js";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const TIMEOUT_MS = 25_000;

export class GeminiAdapter implements AIProviderAdapter {
  async generateRecommendations(prompt: string, apiKey: string): Promise<RecommendedTitle[] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let key = apiKey;

    try {
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7 },
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as GeminiResponse;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;

      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      const recommendations = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : null;

      if (!recommendations) return null;
      return recommendations as RecommendedTitle[];
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
      key = "";
    }
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}
