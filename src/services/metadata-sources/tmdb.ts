/**
 * TMDB Metadata Source Adapter
 *
 * Queries The Movie Database (TMDB) API to resolve recommended titles
 * into Stremio-compatible metadata previews.
 *
 * @module metadata-sources/tmdb
 * @requirements 17.1, 17.2
 */

import type { RecommendedTitle } from "../ai-providers/types.js";
import type { MetadataSource, StremioMetaPreview } from "../metadata-resolver.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

interface TMDBSearchResult {
  id: number;
  title?: string; // movies
  name?: string; // TV shows
  poster_path: string | null;
  overview: string;
  release_date?: string; // movies
  first_air_date?: string; // TV shows
  vote_average?: number;
}

interface TMDBExternalIds {
  imdb_id?: string;
}

/**
 * Creates a TMDB metadata source adapter.
 *
 * @param apiKey - TMDB API key (v3 auth)
 * @returns MetadataSource implementation for TMDB
 */
export function createTMDBSource(apiKey?: string): MetadataSource {
  return {
    name: "TMDB",
    async resolve(title: RecommendedTitle): Promise<StremioMetaPreview | null> {
      if (!apiKey) {
        return null;
      }

      try {
        const mediaType = title.type === "series" ? "tv" : "movie";
        const query = encodeURIComponent(title.title);
        const yearParam = title.year ? `&year=${title.year}` : "";

        const searchUrl = `${TMDB_BASE_URL}/search/${mediaType}?api_key=${apiKey}&query=${query}${yearParam}`;
        const searchResponse = await fetch(searchUrl);

        if (!searchResponse.ok) {
          return null;
        }

        const searchData = (await searchResponse.json()) as {
          results: TMDBSearchResult[];
        };

        if (!searchData.results || searchData.results.length === 0) {
          return null;
        }

        const match = searchData.results[0];

        // Fetch external IDs to get IMDB ID
        const externalIdsUrl = `${TMDB_BASE_URL}/${mediaType}/${match.id}/external_ids?api_key=${apiKey}`;
        const externalIdsResponse = await fetch(externalIdsUrl);
        let imdbId: string | undefined;

        if (externalIdsResponse.ok) {
          const externalIds =
            (await externalIdsResponse.json()) as TMDBExternalIds;
          imdbId = externalIds.imdb_id ?? undefined;
        }

        // Use IMDB ID if available, otherwise fall back to TMDB ID
        const id = imdbId || `tmdb:${match.id}`;
        const name = match.title || match.name || title.title;
        const poster = match.poster_path
          ? `${TMDB_IMAGE_BASE}${match.poster_path}`
          : "";

        if (!poster) {
          return null;
        }

        const releaseDate = match.release_date || match.first_air_date;
        const releaseInfo = releaseDate
          ? releaseDate.substring(0, 4)
          : undefined;
        const imdbRating = match.vote_average
          ? match.vote_average.toFixed(1)
          : undefined;

        return {
          id,
          type: title.type,
          name,
          poster,
          description: match.overview || undefined,
          releaseInfo,
          imdbRating,
        };
      } catch {
        return null;
      }
    },
  };
}
