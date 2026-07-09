/**
 * TVDB Metadata Source Adapter
 *
 * Queries TheTVDB API to resolve recommended titles into
 * Stremio-compatible metadata previews.
 *
 * @module metadata-sources/tvdb
 * @requirements 17.1, 17.2
 */

import type { RecommendedTitle } from "../ai-providers/types.js";
import type { MetadataSource, StremioMetaPreview } from "../metadata-resolver.js";

const TVDB_BASE_URL = "https://api4.thetvdb.com/v4";

interface TVDBSearchResult {
  tvdb_id: string;
  name: string;
  image_url?: string;
  overview?: string;
  year?: string;
  type: string;
  remote_ids?: Array<{ id: string; type: number; sourceName: string }>;
}

/**
 * Creates a TVDB metadata source adapter.
 *
 * @param apiKey - TVDB API key for authentication
 * @returns MetadataSource implementation for TVDB
 */
export function createTVDBSource(apiKey?: string): MetadataSource {
  return {
    name: "TVDB",
    async resolve(title: RecommendedTitle): Promise<StremioMetaPreview | null> {
      if (!apiKey) {
        return null;
      }

      try {
        const query = encodeURIComponent(title.title);
        const typeFilter =
          title.type === "series" ? "&type=series" : "&type=movie";

        const searchUrl = `${TVDB_BASE_URL}/search?query=${query}${typeFilter}`;
        const response = await fetch(searchUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as {
          data: TVDBSearchResult[];
        };

        if (!data.data || data.data.length === 0) {
          return null;
        }

        const match = data.data[0];

        // Try to extract IMDB ID from remote IDs
        let imdbId: string | undefined;
        if (match.remote_ids) {
          const imdbRemote = match.remote_ids.find(
            (r) => r.sourceName === "IMDB"
          );
          if (imdbRemote) {
            imdbId = imdbRemote.id;
          }
        }

        const id = imdbId || `tvdb:${match.tvdb_id}`;
        const poster = match.image_url || "";

        if (!poster) {
          return null;
        }

        return {
          id,
          type: title.type,
          name: match.name,
          poster,
          description: match.overview || undefined,
          releaseInfo: match.year || undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
