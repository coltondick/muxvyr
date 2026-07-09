/**
 * Cinemeta Prewarm Service
 *
 * On startup, prewarms the Cinemeta Redis cache with top movies and series
 * from the last 15 years across all major genres. This ensures that when
 * AI recommendations are resolved, most titles hit the cache instantly.
 *
 * @module cinemeta-prewarm
 */

import { redis } from "../lib/redis.js";
import crypto from "node:crypto";

const CINEMETA_BASE = "https://v3-cinemeta.strem.io";
const CACHE_TTL = 86400; // 24 hours

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", 
  "Documentary", "Drama", "Fantasy", "Horror", "Mystery",
  "Romance", "Sci-Fi", "Thriller", "Western", "Biography",
  "Family", "History", "Music", "War"
];

interface CinemetaItem {
  id: string;
  type: string;
  name: string;
  poster?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  year?: number;
}

/**
 * Prewarms the Cinemeta cache with top titles from the last 15 years.
 * Fetches top catalogs from Cinemeta for each genre and caches the results.
 */
export async function prewarmCinemetaGlobal(): Promise<number> {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 15;
  let totalCached = 0;

  console.log("[prewarm] Starting Cinemeta global prewarm...");

  for (const type of ["movie", "series"] as const) {
    try {
      // Fetch top catalog (returns popular titles)
      const url = `${CINEMETA_BASE}/catalog/${type}/top.json`;
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = (await response.json()) as { metas?: CinemetaItem[] };
      if (!data.metas) continue;

      // Filter to last 15 years and cache each
      const recent = data.metas.filter((item) => {
        const year = extractYear(item.releaseInfo);
        return year !== null && year >= minYear;
      });

      for (const item of recent) {
        if (!item.poster || !item.name) continue;
        const cacheKey = "cinemeta:" + crypto.createHash("md5").update(`${type}:${item.name.toLowerCase()}`).digest("hex");

        try {
          // Only set if not already cached
          const exists = await redis.exists(cacheKey);
          if (!exists) {
            const cached = {
              id: item.id,
              type,
              name: item.name,
              poster: item.poster,
              description: item.description || undefined,
              releaseInfo: item.releaseInfo || undefined,
              imdbRating: item.imdbRating || undefined,
            };
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cached));
            totalCached++;
          }
        } catch {
          continue;
        }
      }

      // Also fetch genre-specific catalogs
      for (const genre of GENRES) {
        try {
          const genreUrl = `${CINEMETA_BASE}/catalog/${type}/top/genre=${encodeURIComponent(genre)}.json`;
          const genreRes = await fetch(genreUrl);
          if (!genreRes.ok) continue;

          const genreData = (await genreRes.json()) as { metas?: CinemetaItem[] };
          if (!genreData.metas) continue;

          const recentGenre = genreData.metas.filter((item) => {
            const year = extractYear(item.releaseInfo);
            return year !== null && year >= minYear;
          });

          for (const item of recentGenre) {
            if (!item.poster || !item.name) continue;
            const cacheKey = "cinemeta:" + crypto.createHash("md5").update(`${type}:${item.name.toLowerCase()}`).digest("hex");

            try {
              const exists = await redis.exists(cacheKey);
              if (!exists) {
                const cached = {
                  id: item.id,
                  type,
                  name: item.name,
                  poster: item.poster,
                  description: item.description || undefined,
                  releaseInfo: item.releaseInfo || undefined,
                  imdbRating: item.imdbRating || undefined,
                };
                await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(cached));
                totalCached++;
              }
            } catch {
              continue;
            }
          }

          // Small delay between genre requests to be polite to Cinemeta
          await new Promise((r) => setTimeout(r, 200));
        } catch {
          continue;
        }
      }
    } catch {
      continue;
    }
  }

  console.log(`[prewarm] Cached ${totalCached} new Cinemeta entries`);
  return totalCached;
}

/**
 * Extracts the start year from Cinemeta releaseInfo (e.g., "2020" or "2020-2023").
 */
function extractYear(releaseInfo?: string): number | null {
  if (!releaseInfo) return null;
  const match = releaseInfo.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}
