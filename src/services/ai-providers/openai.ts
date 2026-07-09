/**
 * OpenAI Provider Adapter
 *
 * @module ai-providers/openai
 */

import type { AIProviderAdapter, RecommendedTitle } from "./types.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 25_000;

export class OpenAIAdapter implements AIProviderAdapter {
  async generateRecommendations(prompt: string, apiKey: string): Promise<RecommendedTitle[] | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let key = apiKey;

    try {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "system", content: prompt }],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = (await response.json()) as OpenAIResponse;
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

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
}
