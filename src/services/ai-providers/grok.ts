/**
 * Grok AI Provider Adapter
 *
 * @module ai-providers/grok
 */

import type { AIProviderAdapter, RecommendedTitle } from "./types.js";

const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-3";
const TIMEOUT_MS = 25_000;

export class GrokAdapter implements AIProviderAdapter {
  async generateRecommendations(prompt: string, apiKey: string): Promise<RecommendedTitle[] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let key = apiKey;

    try {
      const response = await fetch(GROK_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: prompt }],
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as GrokResponse;
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content);
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

interface GrokResponse {
  choices?: Array<{ message?: { content?: string } }>;
}
