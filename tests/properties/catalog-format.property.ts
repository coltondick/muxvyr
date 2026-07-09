/**
 * Property-based tests for catalog response format.
 *
 * Feature: stremio-ai-recommendations, Property 9: Catalog response format compliance
 *
 * Validates: Requirements 11.4
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { formatCatalogResponse } from "../../src/services/catalog-formatter";
import type { StremioMetaPreview } from "../../src/services/metadata-resolver";

/**
 * Arbitrary that generates valid StremioMetaPreview objects.
 */
const stremioMetaPreviewArb: fc.Arbitrary<StremioMetaPreview> = fc.record({
  id: fc.stringOf(fc.constantFrom(..."tt0123456789".split("")), {
    minLength: 9,
    maxLength: 9,
  }),
  type: fc.constantFrom("movie" as const, "series" as const),
  name: fc.string({ minLength: 1, maxLength: 200 }),
  poster: fc.webUrl(),
  description: fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
    nil: undefined,
  }),
  releaseInfo: fc.option(
    fc.integer({ min: 1900, max: 2030 }).map(String),
    { nil: undefined }
  ),
  imdbRating: fc.option(
    fc.float({ min: 1.0, max: 10.0, noNaN: true }).map((n) => n.toFixed(1)),
    { nil: undefined }
  ),
});

/**
 * Arbitrary that generates arrays of StremioMetaPreview objects (0-20 items).
 */
const metaPreviewArrayArb = fc.array(stremioMetaPreviewArb, {
  minLength: 0,
  maxLength: 20,
});

describe("Feature: stremio-ai-recommendations, Property 9: Catalog response format compliance", () => {
  it("formatted response is JSON with metas array where each item has id, type, name, and poster (100 iterations)", () => {
    /**
     * Validates: Requirements 11.4
     *
     * For any set of resolved recommendations, the formatted catalog response
     * SHALL be a JSON object with a `metas` array where each item contains
     * at minimum `id`, `type`, `name`, and `poster` fields.
     */
    fc.assert(
      fc.property(metaPreviewArrayArb, (items) => {
        const response = formatCatalogResponse(items);

        // Response must have a metas array
        expect(response).toHaveProperty("metas");
        expect(Array.isArray(response.metas)).toBe(true);

        // Metas array length must match input length
        expect(response.metas.length).toBe(items.length);

        // Each item in metas must have required fields: id, type, name, poster
        for (const meta of response.metas) {
          expect(meta).toHaveProperty("id");
          expect(typeof meta.id).toBe("string");
          expect(meta.id.length).toBeGreaterThan(0);

          expect(meta).toHaveProperty("type");
          expect(typeof meta.type).toBe("string");
          expect(meta.type.length).toBeGreaterThan(0);

          expect(meta).toHaveProperty("name");
          expect(typeof meta.name).toBe("string");
          expect(meta.name.length).toBeGreaterThan(0);

          expect(meta).toHaveProperty("poster");
          expect(typeof meta.poster).toBe("string");
          expect(meta.poster.length).toBeGreaterThan(0);
        }

        // Verify it can be serialized to valid JSON
        const jsonString = JSON.stringify(response);
        const parsed = JSON.parse(jsonString);
        expect(parsed).toHaveProperty("metas");
        expect(Array.isArray(parsed.metas)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
