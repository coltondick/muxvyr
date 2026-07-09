/**
 * Unit tests for the Metadata Resolver
 *
 * Tests the waterfall resolution strategy:
 * TMDB → TVDB → Cinemeta → Anime Kitsu
 *
 * @requirements 17.1, 17.2, 17.3
 */

import { describe, it, expect, vi } from "vitest";
import {
  resolveMetadata,
} from "../../src/services/metadata-resolver";
import type {
  MetadataSource,
  StremioMetaPreview,
} from "../../src/services/metadata-resolver";
import type { RecommendedTitle } from "../../src/services/ai-providers/types";

// Helper to create a mock metadata source
function createMockSource(
  name: string,
  result: StremioMetaPreview | null,
  shouldThrow = false
): MetadataSource & { resolve: ReturnType<typeof vi.fn> } {
  return {
    name,
    resolve: vi.fn().mockImplementation(async () => {
      if (shouldThrow) {
        throw new Error(`${name} source error`);
      }
      return result;
    }),
  };
}

const sampleTitle: RecommendedTitle = {
  title: "Inception",
  type: "movie",
  year: 2010,
};

const tmdbResult: StremioMetaPreview = {
  id: "tt1375666",
  type: "movie",
  name: "Inception",
  poster: "https://image.tmdb.org/t/p/w500/inception.jpg",
  description: "A thief who steals corporate secrets through dream-sharing.",
  releaseInfo: "2010",
  imdbRating: "8.8",
};

const tvdbResult: StremioMetaPreview = {
  id: "tt1375666",
  type: "movie",
  name: "Inception",
  poster: "https://thetvdb.com/images/inception.jpg",
  description: "A mind-bending thriller by Christopher Nolan.",
  releaseInfo: "2010",
};

const cinemetaResult: StremioMetaPreview = {
  id: "tt1375666",
  type: "movie",
  name: "Inception",
  poster: "https://cinemeta.strem.io/inception.jpg",
  description: "Dom Cobb is a skilled thief.",
};

const kitsuResult: StremioMetaPreview = {
  id: "kitsu:12345",
  type: "movie",
  name: "Inception",
  poster: "https://kitsu.io/images/inception.jpg",
};

describe("Metadata Resolver", () => {
  describe("Waterfall Priority", () => {
    it("returns TMDB result when available (highest priority)", async () => {
      const tmdb = createMockSource("TMDB", tmdbResult);
      const tvdb = createMockSource("TVDB", tvdbResult);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toEqual(tmdbResult);
      expect(tmdb.resolve).toHaveBeenCalledWith(sampleTitle);
    });

    it("falls through to TVDB when TMDB returns null", async () => {
      const tmdb = createMockSource("TMDB", null);
      const tvdb = createMockSource("TVDB", tvdbResult);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toEqual(tvdbResult);
      expect(tmdb.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(tvdb.resolve).toHaveBeenCalledWith(sampleTitle);
    });

    it("falls through to Cinemeta when TMDB and TVDB fail", async () => {
      const tmdb = createMockSource("TMDB", null);
      const tvdb = createMockSource("TVDB", null);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toEqual(cinemetaResult);
      expect(tmdb.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(tvdb.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(cinemeta.resolve).toHaveBeenCalledWith(sampleTitle);
    });

    it("falls through to Anime Kitsu when all above fail", async () => {
      const tmdb = createMockSource("TMDB", null);
      const tvdb = createMockSource("TVDB", null);
      const cinemeta = createMockSource("Cinemeta", null);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toEqual(kitsuResult);
      expect(tmdb.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(tvdb.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(cinemeta.resolve).toHaveBeenCalledWith(sampleTitle);
      expect(kitsu.resolve).toHaveBeenCalledWith(sampleTitle);
    });

    it("returns null when all sources fail", async () => {
      const tmdb = createMockSource("TMDB", null);
      const tvdb = createMockSource("TVDB", null);
      const cinemeta = createMockSource("Cinemeta", null);
      const kitsu = createMockSource("Anime Kitsu", null);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toBeNull();
      expect(tmdb.resolve).toHaveBeenCalled();
      expect(tvdb.resolve).toHaveBeenCalled();
      expect(cinemeta.resolve).toHaveBeenCalled();
      expect(kitsu.resolve).toHaveBeenCalled();
    });
  });

  describe("Short-circuit behavior", () => {
    it("does not call remaining sources after first match", async () => {
      const tmdb = createMockSource("TMDB", tmdbResult);
      const tvdb = createMockSource("TVDB", tvdbResult);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      await resolveMetadata(sampleTitle, [tmdb, tvdb, cinemeta, kitsu]);

      expect(tmdb.resolve).toHaveBeenCalledTimes(1);
      expect(tvdb.resolve).not.toHaveBeenCalled();
      expect(cinemeta.resolve).not.toHaveBeenCalled();
      expect(kitsu.resolve).not.toHaveBeenCalled();
    });

    it("does not call sources after TVDB match", async () => {
      const tmdb = createMockSource("TMDB", null);
      const tvdb = createMockSource("TVDB", tvdbResult);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      await resolveMetadata(sampleTitle, [tmdb, tvdb, cinemeta, kitsu]);

      expect(tmdb.resolve).toHaveBeenCalledTimes(1);
      expect(tvdb.resolve).toHaveBeenCalledTimes(1);
      expect(cinemeta.resolve).not.toHaveBeenCalled();
      expect(kitsu.resolve).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("continues to next source when a source throws an error", async () => {
      const tmdb = createMockSource("TMDB", null, true); // throws
      const tvdb = createMockSource("TVDB", tvdbResult);
      const cinemeta = createMockSource("Cinemeta", cinemetaResult);
      const kitsu = createMockSource("Anime Kitsu", kitsuResult);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toEqual(tvdbResult);
      expect(tmdb.resolve).toHaveBeenCalled();
      expect(tvdb.resolve).toHaveBeenCalled();
    });

    it("returns null when all sources throw errors", async () => {
      const tmdb = createMockSource("TMDB", null, true);
      const tvdb = createMockSource("TVDB", null, true);
      const cinemeta = createMockSource("Cinemeta", null, true);
      const kitsu = createMockSource("Anime Kitsu", null, true);

      const result = await resolveMetadata(sampleTitle, [
        tmdb,
        tvdb,
        cinemeta,
        kitsu,
      ]);

      expect(result).toBeNull();
    });

    it("handles empty sources array", async () => {
      const result = await resolveMetadata(sampleTitle, []);
      expect(result).toBeNull();
    });
  });

  describe("Result completeness", () => {
    it("result includes required fields: id, type, name, poster", async () => {
      const tmdb = createMockSource("TMDB", tmdbResult);

      const result = await resolveMetadata(sampleTitle, [tmdb]);

      expect(result).not.toBeNull();
      expect(result!.id).toBeDefined();
      expect(result!.type).toBeDefined();
      expect(result!.name).toBeDefined();
      expect(result!.poster).toBeDefined();
    });

    it("result includes optional description when available", async () => {
      const tmdb = createMockSource("TMDB", tmdbResult);

      const result = await resolveMetadata(sampleTitle, [tmdb]);

      expect(result!.description).toBe(
        "A thief who steals corporate secrets through dream-sharing."
      );
    });

    it("handles series type titles", async () => {
      const seriesTitle: RecommendedTitle = {
        title: "Breaking Bad",
        type: "series",
        year: 2008,
      };
      const seriesResult: StremioMetaPreview = {
        id: "tt0903747",
        type: "series",
        name: "Breaking Bad",
        poster: "https://image.tmdb.org/t/p/w500/bb.jpg",
        description: "A chemistry teacher turned meth producer.",
        releaseInfo: "2008",
        imdbRating: "9.5",
      };
      const tmdb = createMockSource("TMDB", seriesResult);

      const result = await resolveMetadata(seriesTitle, [tmdb]);

      expect(result).toEqual(seriesResult);
      expect(result!.type).toBe("series");
    });
  });
});
