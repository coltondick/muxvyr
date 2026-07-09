/**
 * AI Provider Adapters
 *
 * Factory module for selecting the correct adapter by name.
 *
 * @module ai-providers
 */

export type { RecommendedTitle, AIProviderAdapter } from "./types.js";
export { GeminiAdapter } from "./gemini.js";
export { OpenAIAdapter } from "./openai.js";
export { GrokAdapter } from "./grok.js";

import type { AIProviderAdapter } from "./types.js";
import { GeminiAdapter } from "./gemini.js";
import { OpenAIAdapter } from "./openai.js";
import { GrokAdapter } from "./grok.js";

/**
 * Returns the appropriate AI provider adapter for the given provider name.
 */
export function getProvider(name: "gemini" | "openai" | "grok"): AIProviderAdapter {
  switch (name) {
    case "gemini":
      return new GeminiAdapter();
    case "openai":
      return new OpenAIAdapter();
    case "grok":
      return new GrokAdapter();
  }
}
