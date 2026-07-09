/**
 * Unit tests for the Manifest Builder service.
 *
 * Tests cover:
 * - All required manifest fields are present
 * - AI Recommendations catalogs always included for movie and series
 * - BYW catalogs generated from recent watch history (up to 5)
 * - BYW catalog names include the watched title
 * - Empty watch history produces only 2 AI Recommendations catalogs
 * - Handles duplicate types in watch history
 */

import { describe, it, expect } from "vitest";
import {
  buildManifest,
  buildManifestUrl,
  type StremioManifest,
} from "../../src/services/manifest-builder";
import type { WatchHistoryItem } from "../../src/services/nuvio-sync";

describe("manifest-builder", () => {
  const makeWatchItem = (
    title: string,
    type: "movie" | "series",
    imdb_id?: string,
    watched_at?: string
  ): WatchHistoryItem => ({
    title,
    type,
    imdb_id,
    watched_at: watched_at ?? new Date().toISOString(),
  });

  describe("buildManifest", () => {
    it("has all required fields: id, version, name, description, resources, types, catalogs", () => {
      const manifest = buildManifest("test-uuid-123", []);

      expect(manifest.id).toBe("com.muxvyr.ai-recommendations");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.name).toBe("AI Recommendations");
      expect(manifest.description).toEqual(
        expect.stringContaining("AI-powered")
      );
      expect(manifest.resources).toEqual(["catalog", { name: "meta", types: ["movie", "series"], idPrefixes: ["tt"] }]);
      expect(manifest.types).toEqual(["movie", "series"]);
      expect(manifest.catalogs).toBeDefined();
      expect(Array.isArray(manifest.catalogs)).toBe(true);
    });

    it("always includes AI Recommendations catalogs for movie and series", () => {
      const manifest = buildManifest("uuid-456", []);

      const movieCatalog = manifest.catalogs.find(
        (c) => c.id === "ai-recommendations-movie"
      );
      const seriesCatalog = manifest.catalogs.find(
        (c) => c.id === "ai-recommendations-series"
      );

      expect(movieCatalog).toBeDefined();
      expect(movieCatalog!.type).toBe("movie");
      expect(movieCatalog!.name).toBe("AI Recommendations");

      expect(seriesCatalog).toBeDefined();
      expect(seriesCatalog!.type).toBe("series");
      expect(seriesCatalog!.name).toBe("AI Recommendations");
    });

    it("generates BYW catalogs from recent watch history up to 5 items", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Inception", "movie", "tt1375666"),
        makeWatchItem("Breaking Bad", "series", "tt0903747"),
        makeWatchItem("The Matrix", "movie", "tt0133093"),
        makeWatchItem("Stranger Things", "series", "tt4574334"),
        makeWatchItem("Interstellar", "movie", "tt0816692"),
        makeWatchItem("Extra Item", "movie", "tt9999999"), // 6th item, should be excluded
      ];

      const manifest = buildManifest("uuid-789", watchHistory);

      // 2 AI Recommendations + 5 BYW = 7 total
      expect(manifest.catalogs.length).toBe(7);

      // Verify the 6th item is not included
      const extraCatalog = manifest.catalogs.find(
        (c) => c.name === "Because you watched: Extra Item"
      );
      expect(extraCatalog).toBeUndefined();
    });

    it("BYW catalog names include the watched title", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Inception", "movie", "tt1375666"),
        makeWatchItem("Breaking Bad", "series", "tt0903747"),
      ];

      const manifest = buildManifest("uuid-abc", watchHistory);

      const bywCatalogs = manifest.catalogs.filter((c) =>
        c.name.startsWith("Because you watched:")
      );

      expect(bywCatalogs.length).toBe(2);
      expect(bywCatalogs[0].name).toBe("Because you watched: Inception");
      expect(bywCatalogs[1].name).toBe("Because you watched: Breaking Bad");
    });

    it("BYW catalog IDs use imdb_id when available", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Inception", "movie", "tt1375666"),
      ];

      const manifest = buildManifest("uuid-def", watchHistory);

      const bywCatalog = manifest.catalogs.find(
        (c) => c.name === "Because you watched: Inception"
      );

      expect(bywCatalog).toBeDefined();
      expect(bywCatalog!.id).toBe("byw-movie-tt1375666");
      expect(bywCatalog!.type).toBe("movie");
    });

    it("BYW catalog IDs use sanitized title when imdb_id is missing", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("The Dark Knight", "movie"),
      ];

      const manifest = buildManifest("uuid-ghi", watchHistory);

      const bywCatalog = manifest.catalogs.find(
        (c) => c.name === "Because you watched: The Dark Knight"
      );

      expect(bywCatalog).toBeDefined();
      expect(bywCatalog!.id).toBe("byw-movie-the-dark-knight");
    });

    it("empty watch history produces only the 2 AI Recommendations catalogs", () => {
      const manifest = buildManifest("uuid-empty", []);

      expect(manifest.catalogs.length).toBe(2);
      expect(manifest.catalogs[0].id).toBe("ai-recommendations-movie");
      expect(manifest.catalogs[1].id).toBe("ai-recommendations-series");
    });

    it("handles duplicate types in watch history", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Movie 1", "movie", "tt0000001"),
        makeWatchItem("Movie 2", "movie", "tt0000002"),
        makeWatchItem("Movie 3", "movie", "tt0000003"),
      ];

      const manifest = buildManifest("uuid-dups", watchHistory);

      // 2 AI Recommendations + 3 BYW = 5 total
      expect(manifest.catalogs.length).toBe(5);

      const bywCatalogs = manifest.catalogs.filter((c) =>
        c.id.startsWith("byw-")
      );
      expect(bywCatalogs.length).toBe(3);

      // All BYW catalogs should be type "movie"
      for (const catalog of bywCatalogs) {
        expect(catalog.type).toBe("movie");
      }
    });

    it("uses the item type for BYW catalogs (movie vs series)", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Movie Title", "movie", "tt1111111"),
        makeWatchItem("Series Title", "series", "tt2222222"),
      ];

      const manifest = buildManifest("uuid-types", watchHistory);

      const movieByw = manifest.catalogs.find(
        (c) => c.id === "byw-movie-tt1111111"
      );
      const seriesByw = manifest.catalogs.find(
        (c) => c.id === "byw-series-tt2222222"
      );

      expect(movieByw).toBeDefined();
      expect(movieByw!.type).toBe("movie");

      expect(seriesByw).toBeDefined();
      expect(seriesByw!.type).toBe("series");
    });

    it("includes idPrefixes in the manifest", () => {
      const manifest = buildManifest("uuid-prefixes", []);
      expect(manifest.idPrefixes).toEqual(["tt"]);
    });

    it("handles titles with special characters in sanitization", () => {
      const watchHistory: WatchHistoryItem[] = [
        makeWatchItem("Spider-Man: No Way Home", "movie"),
      ];

      const manifest = buildManifest("uuid-special", watchHistory);

      const bywCatalog = manifest.catalogs.find(
        (c) => c.name === "Because you watched: Spider-Man: No Way Home"
      );

      expect(bywCatalog).toBeDefined();
      expect(bywCatalog!.id).toBe("byw-movie-spider-man-no-way-home");
    });
  });

  describe("buildManifestUrl", () => {
    it("constructs the correct manifest URL for a given UUID", () => {
      const uuid = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
      const url = buildManifestUrl(uuid);
      expect(url).toBe(
        "muxvyr.com/a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5/manifest.json"
      );
    });

    it("preserves the UUID unchanged in the URL", () => {
      const uuid = "12345678-1234-4234-8234-123456789012";
      const url = buildManifestUrl(uuid);
      expect(url).toContain(uuid);
    });
  });
});
