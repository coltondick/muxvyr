/**
 * Metadata Sources Index
 *
 * @module metadata-sources
 */

import type { MetadataSource } from "../metadata-resolver.js";
import { createTMDBSource } from "./tmdb.js";
import { createTVDBSource } from "./tvdb.js";
import { createCinemetaSource } from "./cinemeta.js";
import { createAnimeKitsuSource } from "./anime-kitsu.js";

export { createTMDBSource } from "./tmdb.js";
export { createTVDBSource } from "./tvdb.js";
export { createCinemetaSource } from "./cinemeta.js";
export { createAnimeKitsuSource } from "./anime-kitsu.js";

/**
 * Returns the default ordered list of metadata sources.
 */
export function getDefaultSources(
  tmdbApiKey?: string,
  tvdbApiKey?: string
): MetadataSource[] {
  const sources: MetadataSource[] = [];
  if (tmdbApiKey) sources.push(createTMDBSource(tmdbApiKey));
  if (tvdbApiKey) sources.push(createTVDBSource(tvdbApiKey));
  sources.push(createCinemetaSource());
  return sources;
}
