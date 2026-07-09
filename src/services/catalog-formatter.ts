/**
 * Catalog Formatter
 *
 * Formats an array of StremioMetaPreview objects into a Stremio-protocol-compliant
 * catalog response with a `metas` array.
 *
 * @module catalog-formatter
 * @requirements 11.4
 */

import type { StremioMetaPreview } from "./metadata-resolver.js";

/**
 * Stremio-protocol-compliant catalog response.
 */
export interface CatalogResponse {
  metas: StremioMetaPreview[];
}

/**
 * Formats an array of StremioMetaPreview objects into a Stremio-protocol-compliant
 * catalog response. Each item in the metas array contains the required fields
 * (id, type, name, poster) and optional fields (description, releaseInfo, imdbRating)
 * only when they are defined.
 *
 * @param items - Array of StremioMetaPreview objects to format
 * @returns A CatalogResponse with the metas array
 */
export function formatCatalogResponse(
  items: StremioMetaPreview[]
): CatalogResponse {
  const metas = items.map((item) => {
    const meta: StremioMetaPreview = {
      id: item.id,
      type: item.type,
      name: item.name,
      poster: item.poster,
    };

    if (item.description !== undefined) {
      meta.description = item.description;
    }

    if (item.releaseInfo !== undefined) {
      meta.releaseInfo = item.releaseInfo;
    }

    if (item.imdbRating !== undefined) {
      meta.imdbRating = item.imdbRating;
    }

    return meta;
  });

  return { metas };
}
