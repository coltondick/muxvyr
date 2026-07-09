/**
 * Cinemeta Metadata Source Adapter
 *
 * @module metadata-sources/cinemeta
 */

import type { RecommendedTitle } from "../ai-providers/types.js";
import type { MetadataSource, StremioMetaPreview } from "../metadata-resolver.js";

const CINEMETA_BASE_URL = "https://v3-cinemeta.strem.io";

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
      try {
        const type = title.type === "series" ? "series" : "movie";
        const query = encodeURIComponent(title.title);
        const searchUrl = `${CINEMETA_BASE_URL}/catalog/${type}/top/search=${query}.json`;
        const response = await fetch(searchUrl);

        if (!response.ok) return null;

        const data = (await response.json()) as { metas: CinemetaResult[] };
        if (!data.metas || data.metas.length === 0) return null;

        const match =
          data.metas.find(
            (m) => m.name.toLowerCase() === title.title.toLowerCase()
          ) || data.metas[0];

        if (!match.poster) return null;

        return {
          id: match.id,
          type: title.type,
          name: match.name,
          poster: match.poster,
          description: match.description || undefined,
          releaseInfo: match.releaseInfo || undefined,
          imdbRating: match.imdbRating || undefined,
        };
      } catch {
        return null;
      }
    },
  };
}
