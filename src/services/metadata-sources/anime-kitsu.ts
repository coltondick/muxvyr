/**
 * Anime Kitsu Metadata Source Adapter
 *
 * Queries the Kitsu API to resolve anime titles into
 * Stremio-compatible metadata previews.
 *
 * @module metadata-sources/anime-kitsu
 * @requirements 17.1, 17.2
 */

import type { RecommendedTitle } from "../ai-providers/types.js";
import type { MetadataSource, StremioMetaPreview } from "../metadata-resolver.js";

const KITSU_BASE_URL = "https://kitsu.io/api/edge";

interface KitsuAttributes {
  canonicalTitle: string;
  synopsis?: string;
  posterImage?: {
    original?: string;
    large?: string;
    medium?: string;
  };
  startDate?: string;
  averageRating?: string;
}

interface KitsuResult {
  id: string;
  type: string;
  attributes: KitsuAttributes;
}

/**
 * Creates an Anime Kitsu metadata source adapter.
 * Kitsu is a free anime database and requires no API key.
 *
 * @returns MetadataSource implementation for Anime Kitsu
 */
export function createAnimeKitsuSource(): MetadataSource {
  return {
    name: "Anime Kitsu",
    async resolve(title: RecommendedTitle): Promise<StremioMetaPreview | null> {
      try {
        const query = encodeURIComponent(title.title);
        const typeFilter =
          title.type === "series" ? "anime" : "anime"; // Kitsu uses anime for both

        const searchUrl = `${KITSU_BASE_URL}/${typeFilter}?filter[text]=${query}&page[limit]=5`;
        const response = await fetch(searchUrl, {
          headers: {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
          },
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as {
          data: KitsuResult[];
        };

        if (!data.data || data.data.length === 0) {
          return null;
        }

        const match = data.data[0];
        const attrs = match.attributes;

        const poster =
          attrs.posterImage?.large ||
          attrs.posterImage?.medium ||
          attrs.posterImage?.original ||
          "";

        if (!poster) {
          return null;
        }

        // Kitsu uses its own ID format - prefix with kitsu:
        const id = `kitsu:${match.id}`;
        const releaseInfo = attrs.startDate
          ? attrs.startDate.substring(0, 4)
          : undefined;

        return {
          id,
          type: title.type,
          name: attrs.canonicalTitle || title.title,
          poster,
          description: attrs.synopsis || undefined,
          releaseInfo,
          imdbRating: attrs.averageRating
            ? (parseFloat(attrs.averageRating) / 10).toFixed(1)
            : undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
