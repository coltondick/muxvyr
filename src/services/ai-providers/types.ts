/**
 * AI Provider Types
 *
 * @module ai-providers/types
 */

export interface RecommendedTitle {
  title: string;
  type: "movie" | "series";
  year?: number;
  reason?: string;
}

export interface AIProviderAdapter {
  generateRecommendations(prompt: string, apiKey: string): Promise<RecommendedTitle[] | null>;
}
