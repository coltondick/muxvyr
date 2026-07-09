/**
 * Property-based tests for manifest builder.
 *
 * Feature: stremio-ai-recommendations
 * - Property 1: Manifest URL construction
 * - Property 7: "Because you watched" catalogs derived from watch history
 * - Property 8: Manifest schema validity
 *
 * Validates: Requirements 1.2, 11.2, 11.3, 14.1, 14.2
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildManifestUrl, buildManifest } from "../../src/services/manifest-builder";
import type { WatchHistoryItem } from "../../src/services/nuvio-sync";

/**
 * Arbitrary that generates valid WatchHistoryItem objects.
 */
const watchHistoryItemArb: fc.Arbitrary<WatchHistoryItem> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  type: fc.constantFrom("movie" as const, "series" as const),
  imdb_id: fc.option(
    fc.stringOf(fc.constantFrom(..."tt0123456789".split("")), {
      minLength: 9,
      maxLength: 9,
    }),
    { nil: undefined }
  ),
  year: fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: undefined }),
  watched_at: fc.date({ min: new Date("2000-01-01"), max: new Date("2025-12-31") }).map(
    (d) => d.toISOString()
  ),
});

/**
 * Arbitrary that generates non-empty watch history arrays (1-50 items).
 */
const watchHistoryArb = fc.array(watchHistoryItemArb, { minLength: 1, maxLength: 50 });

describe("Feature: stremio-ai-recommendations, Property 1: Manifest URL construction", () => {
  it("constructed URL is exactly muxvyr.com/{UUID}/manifest.json with UUID unchanged (100 iterations)", () => {
    /**
     * Validates: Requirements 1.2
     *
     * For any valid UUID string, constructing the manifest URL SHALL produce
     * a string in the exact format `muxvyr.com/{UUID}/manifest.json` where
     * {UUID} is the input UUID unchanged.
     */
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        const url = buildManifestUrl(uuid);
        expect(url).toBe(`muxvyr.com/${uuid}/manifest.json`);
        // Verify UUID is present unchanged in the URL
        expect(url).toContain(uuid);
        // Verify exact format
        expect(url.startsWith("muxvyr.com/")).toBe(true);
        expect(url.endsWith("/manifest.json")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Feature: stremio-ai-recommendations, Property 7: Because you watched catalogs derived from watch history", () => {
  it("generates at least one BYW catalog entry whose name includes a title from the watch history (100 iterations)", () => {
    /**
     * Validates: Requirements 11.2
     *
     * For any non-empty watch history, the manifest builder SHALL generate
     * at least one "Because you watched" catalog entry whose name includes
     * a title from the user's recent watch history.
     */
    fc.assert(
      fc.property(fc.uuid(), watchHistoryArb, (uuid, watchHistory) => {
        const manifest = buildManifest(uuid, watchHistory);

        // Find all BYW catalog entries
        const bywCatalogs = manifest.catalogs.filter((c) =>
          c.name.startsWith("Because you watched:")
        );

        // There must be at least one BYW catalog
        expect(bywCatalogs.length).toBeGreaterThanOrEqual(1);

        // At least one BYW catalog name must include a title from the watch history
        const watchHistoryTitles = watchHistory.map((item) => item.title);
        const hasTitleMatch = bywCatalogs.some((catalog) =>
          watchHistoryTitles.some((title) => catalog.name.includes(title))
        );
        expect(hasTitleMatch).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Feature: stremio-ai-recommendations, Property 8: Manifest schema validity", () => {
  it("generated manifest includes all required fields with valid entries (100 iterations)", () => {
    /**
     * Validates: Requirements 11.3, 14.1, 14.2
     *
     * For any valid user configuration, the generated manifest SHALL conform
     * to the Stremio add-on manifest schema by including: a non-empty id,
     * version, name, description, a non-empty resources array, a non-empty
     * types array, and a non-empty catalogs array where each catalog has
     * type, id, and name.
     */
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(watchHistoryItemArb, { minLength: 0, maxLength: 50 }),
        (uuid, watchHistory) => {
          const manifest = buildManifest(uuid, watchHistory);

          // Non-empty id
          expect(manifest.id).toBeDefined();
          expect(manifest.id.length).toBeGreaterThan(0);

          // Non-empty version
          expect(manifest.version).toBeDefined();
          expect(manifest.version.length).toBeGreaterThan(0);

          // Non-empty name
          expect(manifest.name).toBeDefined();
          expect(manifest.name.length).toBeGreaterThan(0);

          // Non-empty description
          expect(manifest.description).toBeDefined();
          expect(manifest.description.length).toBeGreaterThan(0);

          // Non-empty resources array
          expect(manifest.resources).toBeDefined();
          expect(manifest.resources.length).toBeGreaterThan(0);

          // Non-empty types array
          expect(manifest.types).toBeDefined();
          expect(manifest.types.length).toBeGreaterThan(0);

          // Non-empty catalogs array
          expect(manifest.catalogs).toBeDefined();
          expect(manifest.catalogs.length).toBeGreaterThan(0);

          // Each catalog has type, id, and name
          for (const catalog of manifest.catalogs) {
            expect(catalog.type).toBeDefined();
            expect(catalog.type.length).toBeGreaterThan(0);
            expect(catalog.id).toBeDefined();
            expect(catalog.id.length).toBeGreaterThan(0);
            expect(catalog.name).toBeDefined();
            expect(catalog.name.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
