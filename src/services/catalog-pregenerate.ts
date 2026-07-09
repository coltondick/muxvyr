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
import { setCatalog, prewarmCinemetaCache } from "./cache.js";
import { getEncryptionKey } from "../lib/config.js";
import { query } from "../lib/db.js";
import { redis } from "../lib/redis.js";
import {
  getRecommendationHistoryTitles,
  saveRecommendationHistory,
  getDismissedTitles,
} from "./recommendation-history.js";

/** Lock duration for deduplication: 5 minutes */
const GENERATION_LOCK_TTL = 300;

/**
 * Resolves metadata for a list of recommended titles in parallel (batch of 10).
 */
async function resolveMetadataBatch(
  recommendations: RecommendedTitle[],
  excludeIds: Set<string>
): Promise<StremioMetaPreview[]> {
  const results: StremioMetaPreview[] = [];
  // Process ALL in parallel — Cinemeta can handle it
  const batchResults = await Promise.allSettled(
    recommendations.map((rec) => resolveMetadata(rec))
  );
  for (const result of batchResults) {
    if (result.status === "fulfilled" && result.value && !excludeIds.has(result.value.id)) {
      results.push(result.value);
      excludeIds.add(result.value.id);
    }
  }
  return results;
}

/**
 * Attempts to acquire a generation lock for a user.
 * Returns true if lock acquired, false if already in progress.
 */
async function acquireGenerationLock(uuid: string): Promise<boolean> {
  try {
    const result = await redis.set(`lock:gen:${uuid}`, "1", "EX", GENERATION_LOCK_TTL, "NX");
    return result === "OK";
  } catch {
    // If Redis fails, proceed anyway
    return true;
  }
}

/**
 * Releases the generation lock for a user.
 */
async function releaseGenerationLock(uuid: string): Promise<void> {
  try {
    await redis.del(`lock:gen:${uuid}`);
  } catch {
    // Non-fatal
  }
}

/**
 * Logs a generation event to the database.
 */
async function logGeneration(
  uuid: string,
  catalogType: string,
  contentType: string | null,
  itemsGenerated: number,
  durationMs: number,
  error?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO generation_logs (user_uuid, catalog_type, content_type, items_generated, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuid, catalogType, contentType, itemsGenerated, durationMs, error || null]
    );
  } catch {
    // Non-fatal
  }
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
  excludeIds?: Set<string>,
  alreadyRecommended?: string[],
  dismissedTitles?: string[]
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
    alreadyRecommended,
    dismissedTitles,
    count: 30,
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
  // Acquire deduplication lock
  const lockAcquired = await acquireGenerationLock(uuid);
  if (!lockAcquired) {
    console.log(`[pregenerate] Skipping ${uuid} — generation already in progress`);
    return;
  }

  try {
    const config = await getConfiguration(uuid);
    if (!config) return;

    const cryptoKey = importKey(getEncryptionKey());
    const apiKey = decrypt(config.encrypted_api_key, config.api_key_iv, cryptoKey);
    const nuvioCredentials = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);

    const watchHistory = await fetchWatchHistory(nuvioCredentials, uuid);
    const usedTitleIds = new Set<string>();

    // Prewarm Cinemeta cache for watch history titles (runs in parallel, fast for cache hits)
    await prewarmCinemetaCache(watchHistory);

    // Load recommendation history and dismissed titles for prompt
    const alreadyRecommended = await getRecommendationHistoryTitles(uuid, 50);
    const dismissedIds = await getDismissedTitles(uuid);

    // Generate movie and series catalogs IN PARALLEL
    const generalResults = await Promise.allSettled(
      (["movie", "series"] as const).map(async (contentType) => {
        const startTime = Date.now();
        try {
          const result = await generateSingleCatalog(
            config, apiKey, watchHistory, contentType, "general", undefined, new Set(usedTitleIds), alreadyRecommended, dismissedIds
          );
          const filteredItems = result.items.filter((item) => !dismissedIds.includes(item.id));
          if (filteredItems.length > 0) {
            await setCatalog(uuid, `ai-recommendations-${contentType}`, filteredItems);
            await saveRecommendationHistory(uuid, filteredItems, "general");
            for (const item of filteredItems) usedTitleIds.add(item.id);
          }
          const duration = Date.now() - startTime;
          await logGeneration(uuid, "general", contentType, filteredItems.length, duration);
          return filteredItems;
        } catch (err) {
          const duration = Date.now() - startTime;
          await logGeneration(uuid, "general", contentType, 0, duration, err instanceof Error ? err.message : "Unknown error");
          return [];
        }
      })
    );

    // Generate BYW catalogs for the 4 most recent unique watch history items — ALL IN PARALLEL
    const seenTitles = new Set<string>();
    const recentItems: typeof watchHistory = [];
    for (const item of watchHistory) {
      if (!seenTitles.has(item.title) && recentItems.length < 4) {
        seenTitles.add(item.title);
        recentItems.push(item);
      }
    }

    await Promise.allSettled(
      recentItems.map(async (item) => {
        const startTime = Date.now();
        try {
          const identifier = item.imdb_id ?? sanitizeTitleForId(item.title);
          const catalogId = `byw-${item.type}-${identifier}`;
          const result = await generateSingleCatalog(
            config, apiKey, watchHistory, item.type, "because-you-watched", item.title, new Set(usedTitleIds), alreadyRecommended, dismissedIds
          );
          const filteredItems = result.items.filter((i) => !dismissedIds.includes(i.id));
          if (filteredItems.length > 0) {
            await setCatalog(uuid, catalogId, filteredItems);
            await saveRecommendationHistory(uuid, filteredItems, "byw");
          }
          const duration = Date.now() - startTime;
          await logGeneration(uuid, "byw", item.type, filteredItems.length, duration);
        } catch (err) {
          const duration = Date.now() - startTime;
          await logGeneration(uuid, "byw", item.type, 0, duration, err instanceof Error ? err.message : "Unknown error");
        }
      })
    );
  } catch {
    // Background job failure is non-fatal
  } finally {
    await releaseGenerationLock(uuid);
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
