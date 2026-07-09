/**
 * Metadata Resolver
 *
 * Resolves AI-generated title names into Stremio-compatible metadata objects
 * using a waterfall resolution strategy.
 *
 * @module metadata-resolver
 */

import type { RecommendedTitle } from "./ai-providers/types.js";

export interface StremioMetaPreview {
  id: string;
  type: "movie" | "series";
  name: string;
  poster: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
}

export interface MetadataSource {
  name: string;
  resolve(title: RecommendedTitle): Promise<StremioMetaPreview | null>;
}

/**
 * Resolves a recommended title into a StremioMetaPreview by querying
 * metadata sources in priority order (waterfall).
 */
export async function resolveMetadata(
  title: RecommendedTitle,
  sources?: MetadataSource[]
): Promise<StremioMetaPreview | null> {
  const { getDefaultSources } = await import("./metadata-sources/index.js");
  const resolvers = sources ?? getDefaultSources();

  for (const source of resolvers) {
    try {
      const result = await source.resolve(title);
      if (result !== null) {
        return result;
      }
    } catch {
      continue;
    }
  }

  return null;
}
