/**
 * AI Recommendation Engine Orchestrator
 *
 * Selects the correct AI provider adapter based on user configuration,
 * builds the system prompt, calls the adapter, and returns recommendations.
 *
 * @module ai-engine
 */

import type { WatchHistoryItem } from "./nuvio-sync.js";
import type { RecommendedTitle } from "./ai-providers/types.js";
import { buildSystemPrompt } from "./prompt-builder.js";
import { getProvider } from "./ai-providers/index.js";

/**
 * Context required for generating AI recommendations.
 */
export interface RecommendationContext {
  provider: "gemini" | "openai" | "grok";
  apiKey: string;
  watchHistory: WatchHistoryItem[];
  languages: string[];
  fineTuningParams?: string;
  countryFilter?: string[];
  genreExclusions?: string[];
  genrePreferences?: string[];
  catalogType: "general" | "because-you-watched";
  referenceTitleForByw?: string;
  contentType?: "movie" | "series";
}

/**
 * Generates AI-powered content recommendations based on the provided context.
 */
export async function generateRecommendations(
  context: RecommendationContext
): Promise<RecommendedTitle[] | null> {
  try {
    const watchHistoryTitles = context.watchHistory.map((item) => item.title);

    const watchHistoryDetails = await enrichWatchHistory(context.watchHistory);

    let referenceTitleDescription: string | undefined;
    if (context.catalogType === "because-you-watched" && context.referenceTitleForByw) {
      const refItem = context.watchHistory.find(
        (item) => item.title === context.referenceTitleForByw
      );
      if (refItem) {
        const details = await fetchCinemetaDetails(refItem.title, refItem.type);
        if (details) {
          referenceTitleDescription = details.description;
        }
      }
    }

    const prompt = buildSystemPrompt({
      watchHistory: watchHistoryTitles,
      watchHistoryDetails,
      languages: context.languages,
      fineTuningParams: context.fineTuningParams,
      countryFilter: context.countryFilter,
      genreExclusions: context.genreExclusions,
      genrePreferences: context.genrePreferences,
      catalogType: context.catalogType,
      referenceTitleForByw: context.referenceTitleForByw,
      referenceTitleDescription,
      contentType: context.contentType,
    });

    const adapter = getProvider(context.provider);
    const recommendations = await adapter.generateRecommendations(prompt, context.apiKey);

    return recommendations;
  } catch {
    return null;
  }
}

async function enrichWatchHistory(
  watchHistory: WatchHistoryItem[]
): Promise<import("./prompt-builder.js").WatchHistoryDetail[]> {
  const items = watchHistory.slice(0, 10);

  const results = await Promise.allSettled(
    items.map(async (item): Promise<import("./prompt-builder.js").WatchHistoryDetail> => {
      const meta = await fetchCinemetaDetails(item.title, item.type);
      if (meta) {
        return { title: item.title, description: meta.description, genres: meta.genres, year: item.year };
      }
      return { title: item.title, year: item.year };
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<import("./prompt-builder.js").WatchHistoryDetail> => r.status === "fulfilled")
    .map((r) => r.value);
}

async function fetchCinemetaDetails(
  title: string,
  type: "movie" | "series"
): Promise<{ description?: string; genres?: string[] } | null> {
  try {
    const query = encodeURIComponent(title);
    const response = await fetch(
      `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${query}.json`
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      metas?: Array<{ name: string; description?: string; genres?: string[] }>;
    };

    if (!data.metas || data.metas.length === 0) return null;

    const match = data.metas.find(
      (m) => m.name.toLowerCase() === title.toLowerCase()
    ) || data.metas[0];

    return {
      description: match.description || undefined,
      genres: match.genres || undefined,
    };
  } catch {
    return null;
  }
}
