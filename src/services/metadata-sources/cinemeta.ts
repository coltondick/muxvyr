/**
 * Cinemeta Metadata Source Adapter
 *
 * Queries Stremio's Cinemeta addon with Redis caching (24h TTL).
 *
 * @module metadata-sources/cinemeta
 */

import type { RecommendedTitle } from "../ai-providers/types.js";
import type { MetadataSource, StremioMetaPreview } from "../metadata-resolver.js";
import { redis } from "../../lib/redis.js";
import crypto from "node:crypto";

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";
const CACHE_TTL = 86400; // 24 hours

interface CinemetaResult {
  id: string;
  type: string;
  name: string;
  poster?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
}

export function createCinemetaSource(): MetadataSource {
  return {
    name: "Cinemeta",
    async resolve(title: RecommendedTitle): Promise<StremioMetaPreview | null> {
      const cacheKey = "cinemeta:" + crypto.createHash("md5").update(`${title.type}:${title.title.toLowerCase()}`).digest("hex");

      // Check Redis cache
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as StremioMetaPreview;
          // Exclude unreleased titles
          if (isUnreleased(parsed.releaseInfo)) return null;
          return parsed;
        }
        if (cached === "") return null; // Cached negative result
      } catch {
        // Cache read failed, proceed with fetch
      }

      try {
        const type = title.type === "series" ? "series" : "movie";
        const query = encodeURIComponent(title.title);
        const searchUrl = `${CINEMETA_BASE_URL}/catalog/${type}/top/search=${query}.json`;
        const response = await fetch(searchUrl, { redirect: "follow" });

        if (!response.ok) {
          // Cache the miss for 1 hour to avoid repeated failed lookups
          try { await redis.setex(cacheKey, 3600, ""); } catch {}
          return null;
        }

        const data = (await response.json()) as { metas: CinemetaResult[] };
        if (!data.metas || data.metas.length === 0) {
          try { await redis.setex(cacheKey, 3600, ""); } catch {}
          return null;
        }

        const match =
          data.metas.find(
            (m) => m.name.toLowerCase() === title.title.toLowerCase()
          ) || data.metas[0];

        if (!match.poster) {
          try { await redis.setex(cacheKey, 3600, ""); } catch {}
          return null;
        }

        const result: StremioMetaPreview = {
          id: match.id,
          type: title.type,
          name: match.name,
          poster: match.poster,
          description: match.description || undefined,
          releaseInfo: match.releaseInfo || undefined,
          imdbRating: match.imdbRating || undefined,
        };

        // Exclude unreleased titles
        if (isUnreleased(result.releaseInfo)) {
          try { await redis.setex(cacheKey, 3600, ""); } catch {}
          return null;
        }

        // Cache successful result for 24 hours
        try { await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)); } catch {}

        return result;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Checks if a title hasn't been released digitally yet.
 * Titles with future release years or release year === current year with no month info
 * are considered potentially unreleased.
 */
function isUnreleased(releaseInfo?: string): boolean {
  if (!releaseInfo) return false;
  const currentYear = new Date().getFullYear();
  const match = releaseInfo.match(/(\d{4})/);
  if (!match) return false;
  const year = parseInt(match[1], 10);
  // If the release year is in the future, it's unreleased
  return year > currentYear;
}
