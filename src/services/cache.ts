/**
 * Cache Service
 *
 * Manages Redis caching using ioredis with structured key patterns.
 *
 * Key patterns:
 * - `catalog:{uuid}:{catalogId}` — cached catalog responses (TTL: 6 hours)
 * - `meta:{imdbId}` — cached metadata lookups (TTL: 24 hours)
 *
 * @module cache
 */

import { redis } from "../lib/redis.js";
import type { StremioMetaPreview } from "./metadata-resolver.js";

/** Default TTL for catalog cache entries (6 hours in seconds) */
export const CATALOG_TTL_SECONDS = 21600;

/** Default TTL for metadata cache entries (24 hours in seconds) */
export const METADATA_TTL_SECONDS = 86400;

/**
 * Retrieves a cached catalog response for a user and catalog ID.
 */
export async function getCatalog(
  uuid: string,
  catalogId: string
): Promise<StremioMetaPreview[] | null> {
  const key = `catalog:${uuid}:${catalogId}`;
  try {
    const result = await redis.get(key);
    if (result === null) return null;
    return JSON.parse(result) as StremioMetaPreview[];
  } catch {
    return null;
  }
}

/**
 * Stores a catalog response in Redis with a TTL.
 */
export async function setCatalog(
  uuid: string,
  catalogId: string,
  data: StremioMetaPreview[],
  ttlSeconds: number = CATALOG_TTL_SECONDS
): Promise<void> {
  const key = `catalog:${uuid}:${catalogId}`;
  const value = JSON.stringify(data);
  await redis.setex(key, ttlSeconds, value);
}

/**
 * Retrieves cached metadata for an IMDB ID.
 */
export async function getMetadata(
  imdbId: string
): Promise<StremioMetaPreview | null> {
  const key = `meta:${imdbId}`;
  try {
    const result = await redis.get(key);
    if (result === null) return null;
    return JSON.parse(result) as StremioMetaPreview;
  } catch {
    return null;
  }
}

/**
 * Stores metadata in Redis with a TTL.
 */
export async function setMetadata(
  imdbId: string,
  data: StremioMetaPreview,
  ttlSeconds: number = METADATA_TTL_SECONDS
): Promise<void> {
  const key = `meta:${imdbId}`;
  const value = JSON.stringify(data);
  await redis.setex(key, ttlSeconds, value);
}

/**
 * Invalidates all cached catalogs for a given user.
 * Uses SCAN to find all keys matching `catalog:{uuid}:*` and deletes them.
 */
export async function invalidateUser(uuid: string): Promise<void> {
  const pattern = `catalog:${uuid}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "100"
    );
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

/**
 * Scan for keys matching a pattern.
 */
export async function scanKeys(pattern: string): Promise<string[]> {
  const allKeys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "100"
    );
    cursor = nextCursor;
    allKeys.push(...keys);
  } while (cursor !== "0");
  return allKeys;
}

/**
 * Prewarms the Cinemeta cache for a user's watch history.
 * Fetches metadata for each title if not already cached.
 */
export async function prewarmCinemetaCache(
  watchHistory: Array<{ title: string; type: "movie" | "series" }>
): Promise<number> {
  const { createCinemetaSource } = await import("./metadata-sources/cinemeta.js");
  const cinemeta = createCinemetaSource();
  let warmed = 0;

  // Resolve all in parallel — cache hits are instant, misses will fetch and cache
  const results = await Promise.allSettled(
    watchHistory.slice(0, 50).map((item) =>
      cinemeta.resolve({ title: item.title, type: item.type })
    )
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      warmed++;
    }
  }

  return warmed;
}
