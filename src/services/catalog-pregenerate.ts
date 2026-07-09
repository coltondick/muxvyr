/**
 * Catalog Pre-generation Service
 *
 * Generates AI recommendations in the background after a config save.
 * In the self-hosted version, this runs inside a BullMQ worker with no time limits.
 *
 * @module catalog-pregenerate
 */

import { getConfiguration } from "./configuration.js";
import { decrypt, importKey } from "./encryption.js";
import { fetchWatchHistory } from "./nuvio-sync.js";
import { generateRecommendations } from "./ai-engine.js";
import { resolveMetadata } from "./metadata-resolver.js";
import type { StremioMetaPreview } from "./metadata-resolver.js";
import type { RecommendedTitle } from "./ai-providers/types.js";
import { setCatalog } from "./cache.js";
import { getEncryptionKey } from "../lib/config.js";
import { query } from "../lib/db.js";

/**
 * Resolves metadata for a list of recommended titles in parallel (batch of 5).
 */
async function resolveMetadataBatch(
  recommendations: RecommendedTitle[],
  excludeIds: Set<string>
): Promise<StremioMetaPreview[]> {
  const results: StremioMetaPreview[] = [];
  for (let i = 0; i < recommendations.length; i += 5) {
    const batch = recommendations.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map((rec) => resolveMetadata(rec))
    );
    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value && !excludeIds.has(result.value.id)) {
        results.push(result.value);
        excludeIds.add(result.value.id);
      }
    }
  }
  return results;
}

/**
 * Generates a single catalog (AI call + metadata resolution).
 */
async function generateSingleCatalog(
  config: {
    ai_provider: "gemini" | "openai" | "grok";
    languages: string[];
    fine_tuning_params?: string | null;
    country_filter?: string[] | null;
    genre_exclusions?: string[] | null;
    genre_preferences?: string[] | null;
  },
  apiKey: string,
  watchHistory: import("./nuvio-sync.js").WatchHistoryItem[],
  contentType: "movie" | "series",
  catalogType: "general" | "because-you-watched",
  referenceTitleForByw?: string,
  excludeIds?: Set<string>
): Promise<{ items: StremioMetaPreview[]; ids: Set<string> }> {
  const exclude = excludeIds || new Set<string>();

  const recommendations = await generateRecommendations({
    provider: config.ai_provider,
    apiKey,
    watchHistory,
    languages: config.languages,
    fineTuningParams: config.fine_tuning_params || undefined,
    countryFilter: config.country_filter || undefined,
    genreExclusions: config.genre_exclusions || undefined,
    genrePreferences: config.genre_preferences || undefined,
    catalogType,
    referenceTitleForByw,
    contentType,
  });

  if (!recommendations) return { items: [], ids: exclude };

  const filtered = recommendations.filter((r) => r.type === contentType);
  const resolved = await resolveMetadataBatch(filtered, exclude);

  return { items: resolved, ids: exclude };
}

/**
 * Pre-generates catalogs for a user.
 * No time limits in the self-hosted version — generates ALL catalogs including BYW.
 */
export async function pregenerateCatalogs(uuid: string): Promise<void> {
  try {
    const config = await getConfiguration(uuid);
    if (!config) return;

    const cryptoKey = importKey(getEncryptionKey());
    const apiKey = decrypt(config.encrypted_api_key, config.api_key_iv, cryptoKey);
    const nuvioCredentials = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);

    const watchHistory = await fetchWatchHistory(nuvioCredentials, uuid);
    const usedTitleIds = new Set<string>();

    // Generate movie and series catalogs sequentially
    for (const contentType of ["movie", "series"] as const) {
      try {
        const result = await generateSingleCatalog(
          config, apiKey, watchHistory, contentType, "general", undefined, usedTitleIds
        );
        if (result.items.length > 0) {
          await setCatalog(uuid, `ai-recommendations-${contentType}`, result.items);
        }
      } catch {
        continue;
      }
    }

    // Generate BYW catalogs for the 5 most recent watch history items (no time limits!)
    const recentItems = watchHistory.slice(0, 5);
    for (const item of recentItems) {
      try {
        const identifier = item.imdb_id ?? sanitizeTitleForId(item.title);
        const catalogId = `byw-${item.type}-${identifier}`;
        const result = await generateSingleCatalog(
          config, apiKey, watchHistory, item.type, "because-you-watched", item.title, usedTitleIds
        );
        if (result.items.length > 0) {
          await setCatalog(uuid, catalogId, result.items);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Background job failure is non-fatal
  }
}

function sanitizeTitleForId(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Regenerates catalogs for ALL active users (called by cron).
 */
export async function regenerateAllCatalogs(): Promise<void> {
  try {
    const result = await query<{ uuid: string }>(
      `SELECT uuid FROM user_configurations`
    );

    for (const user of result.rows) {
      try {
        await pregenerateCatalogs(user.uuid);
        // Brief pause between users to avoid overwhelming external APIs
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch {
        continue;
      }
    }
  } catch {
    // Non-fatal
  }
}
