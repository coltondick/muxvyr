/**
 * Unit tests for the Catalog Formatter service.
 *
 * Tests cover:
 * - Returns object with metas array
 * - Includes all required fields (id, type, name, poster)
 * - Includes optional fields when present
 * - Excludes optional fields when undefined
 * - Handles empty input array
 * - Preserves original data
 */

import { describe, it, expect } from "vitest";
import {
  formatCatalogResponse,
  type CatalogResponse,
} from "../../src/services/catalog-formatter";
import type { StremioMetaPreview } from "../../src/services/metadata-resolver";

describe("catalog-formatter", () => {
  const makeMeta = (
    overrides: Partial<StremioMetaPreview> = {}
  ): StremioMetaPreview => ({
    id: "tt1234567",
    type: "movie",
    name: "Test Movie",
    poster: "https://example.com/poster.jpg",
    ...overrides,
  });

  describe("formatCatalogResponse", () => {
    it("returns an object with a metas array", () => {
      const result = formatCatalogResponse([]);

      expect(result).toHaveProperty("metas");
      expect(Array.isArray(result.metas)).toBe(true);
    });

    it("includes all required fields (id, type, name, poster) in each meta item", () => {
      const items: StremioMetaPreview[] = [
        makeMeta({ id: "tt0000001", type: "movie", name: "Movie A", poster: "https://img.com/a.jpg" }),
        makeMeta({ id: "tt0000002", type: "series", name: "Series B", poster: "https://img.com/b.jpg" }),
      ];

      const result = formatCatalogResponse(items);

      expect(result.metas.length).toBe(2);

      expect(result.metas[0].id).toBe("tt0000001");
      expect(result.metas[0].type).toBe("movie");
      expect(result.metas[0].name).toBe("Movie A");
      expect(result.metas[0].poster).toBe("https://img.com/a.jpg");

      expect(result.metas[1].id).toBe("tt0000002");
      expect(result.metas[1].type).toBe("series");
      expect(result.metas[1].name).toBe("Series B");
      expect(result.metas[1].poster).toBe("https://img.com/b.jpg");
    });

    it("includes optional fields (description, releaseInfo, imdbRating) when present", () => {
      const items: StremioMetaPreview[] = [
        makeMeta({
          description: "A great movie about testing",
          releaseInfo: "2023",
          imdbRating: "8.5",
        }),
      ];

      const result = formatCatalogResponse(items);

      expect(result.metas[0].description).toBe("A great movie about testing");
      expect(result.metas[0].releaseInfo).toBe("2023");
      expect(result.metas[0].imdbRating).toBe("8.5");
    });

    it("excludes optional fields when they are undefined", () => {
      const items: StremioMetaPreview[] = [
        makeMeta(), // no optional fields set
      ];

      const result = formatCatalogResponse(items);
      const meta = result.metas[0];

      expect(meta.id).toBe("tt1234567");
      expect(meta.type).toBe("movie");
      expect(meta.name).toBe("Test Movie");
      expect(meta.poster).toBe("https://example.com/poster.jpg");
      expect("description" in meta).toBe(false);
      expect("releaseInfo" in meta).toBe(false);
      expect("imdbRating" in meta).toBe(false);
    });

    it("handles empty input array by returning { metas: [] }", () => {
      const result = formatCatalogResponse([]);

      expect(result).toEqual({ metas: [] });
    });

    it("preserves original data without modification", () => {
      const items: StremioMetaPreview[] = [
        {
          id: "tt9876543",
          type: "series",
          name: "Original Series: The Test",
          poster: "https://cdn.example.com/series-poster.png",
          description: "A series about preserving data",
          releaseInfo: "2020-2024",
          imdbRating: "9.1",
        },
      ];

      const result = formatCatalogResponse(items);

      expect(result.metas[0]).toEqual({
        id: "tt9876543",
        type: "series",
        name: "Original Series: The Test",
        poster: "https://cdn.example.com/series-poster.png",
        description: "A series about preserving data",
        releaseInfo: "2020-2024",
        imdbRating: "9.1",
      });
    });

    it("handles multiple items with mixed optional fields", () => {
      const items: StremioMetaPreview[] = [
        makeMeta({ id: "tt0001", description: "Has description only" }),
        makeMeta({ id: "tt0002", imdbRating: "7.2" }),
        makeMeta({ id: "tt0003", releaseInfo: "2022", description: "Has two optionals" }),
      ];

      const result = formatCatalogResponse(items);

      expect(result.metas.length).toBe(3);

      // First item: only description
      expect(result.metas[0].description).toBe("Has description only");
      expect("releaseInfo" in result.metas[0]).toBe(false);
      expect("imdbRating" in result.metas[0]).toBe(false);

      // Second item: only imdbRating
      expect("description" in result.metas[1]).toBe(false);
      expect("releaseInfo" in result.metas[1]).toBe(false);
      expect(result.metas[1].imdbRating).toBe("7.2");

      // Third item: releaseInfo + description
      expect(result.metas[2].description).toBe("Has two optionals");
      expect(result.metas[2].releaseInfo).toBe("2022");
      expect("imdbRating" in result.metas[2]).toBe(false);
    });
  });
});
