/**
 * Manifest Builder
 *
 * Generates Stremio-compatible manifest JSON per user. Includes
 * "AI Recommendations" catalogs for both movies and series, plus
 * "Because you watched [Title]" catalogs derived from recent watch history.
 *
 * @module manifest-builder
 * @requirements 11.1, 11.2, 11.3, 14.1, 14.2
 */

import type { WatchHistoryItem } from "./nuvio-sync.js";

/**
 * Stremio-compatible manifest structure.
 */
export interface StremioManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  resources: Array<string | { name: string; types: string[]; idPrefixes?: string[] }>;
  types: string[];
  catalogs: Array<{
    type: string;
    id: string;
    name: string;
    extra?: Array<{ name: string; isRequired: boolean }>;
  }>;
  idPrefixes?: string[];
}

/** Maximum number of "Because you watched" catalog entries */
const MAX_BYW_CATALOGS = 5;

/**
 * Builds a Stremio-compatible manifest for a given user based on their watch history.
 *
 * Always includes "AI Recommendations" catalogs for both movies and series.
 * Generates "Because you watched: [Title]" catalogs from the most recent
 * 3-5 watch history items.
 *
 * @param uuid - The user's unique configuration identifier
 * @param watchHistory - The user's watch history items (sorted most recent first)
 * @returns A complete StremioManifest object
 */
export function buildManifest(
  uuid: string,
  watchHistory: WatchHistoryItem[]
): StremioManifest {
  const catalogs: StremioManifest["catalogs"] = [
    {
      type: "movie",
      id: "ai-recommendations-movie",
      name: "AI Recommendations",
    },
    {
      type: "series",
      id: "ai-recommendations-series",
      name: "AI Recommendations",
    },
  ];

  // Generate BYW catalogs from the most recent watch history items (up to MAX_BYW_CATALOGS)
  const recentItems = watchHistory.slice(0, MAX_BYW_CATALOGS);

  for (const item of recentItems) {
    const catalogId = buildBywCatalogId(item);
    catalogs.push({
      type: item.type,
      id: catalogId,
      name: `Because you watched: ${item.title}`,
    });
  }

  return {
    id: "com.muxvyr.ai-recommendations",
    version: "1.0.0",
    name: "AI Recommendations",
    description:
      "Personalized AI-powered content recommendations based on your watch history",
    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    catalogs,
    idPrefixes: ["tt"],
  };
}

/**
 * Builds the catalog ID for a "Because you watched" entry.
 *
 * Format: `byw-{type}-{imdb_id || sanitized-title}`
 *
 * @param item - The watch history item to generate the catalog ID for
 * @returns The formatted catalog ID string
 */
function buildBywCatalogId(item: WatchHistoryItem): string {
  const identifier = item.imdb_id ?? sanitizeTitle(item.title);
  return `byw-${item.type}-${identifier}`;
}

/**
 * Sanitizes a title for use in a catalog ID.
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
 * and collapses multiple hyphens.
 *
 * @param title - The title to sanitize
 * @returns A URL-safe sanitized string
 */
function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Constructs the manifest URL for a given UUID.
 *
 * @param uuid - The user's unique configuration identifier
 * @returns The full manifest URL string
 */
export function buildManifestUrl(uuid: string): string {
  return `muxvyr.com/${uuid}/manifest.json`;
}
