/**
 * Property-based tests for metadata resolution waterfall.
 *
 * Feature: stremio-ai-recommendations, Property 13: Metadata resolution waterfall and completeness
 *
 * Validates: Requirements 17.1, 17.2, 17.3
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { resolveMetadata, MetadataSource, StremioMetaPreview } from "../../src/services/metadata-resolver";
import type { RecommendedTitle } from "../../src/services/ai-providers/types";

/**
 * Source names in priority order matching the waterfall: TMDB → TVDB → Cinemeta → Anime Kitsu
 */
const SOURCE_NAMES = ["TMDB", "TVDB", "Cinemeta", "AnimeKitsu"] as const;

/**
 * Arbitrary for a RecommendedTitle object.
 */
const recommendedTitleArb: fc.Arbitrary<RecommendedTitle> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "), {
      minLength: 2,
      maxLength: 30,
    }).filter((s) => s.trim().length > 0),
    fc.constantFrom("movie", "series") as fc.Arbitrary<"movie" | "series">,
    fc.option(fc.integer({ min: 1900, max: 2030 }), { nil: undefined }),
    fc.option(
      fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz "), { minLength: 3, maxLength: 30 }),
      { nil: undefined }
    )
  )
  .map(([title, type, year, reason]) => ({ title, type, year, reason }));

/**
 * Arbitrary for a StremioMetaPreview object representing a resolved metadata result.
 */
const metaPreviewArb: fc.Arbitrary<StremioMetaPreview> = fc
  .tuple(
    fc.stringOf(fc.constantFrom(..."0123456789"), { minLength: 7, maxLength: 7 }).map((digits) => `tt${digits}`),
    fc.constantFrom("movie", "series") as fc.Arbitrary<"movie" | "series">,
    fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "), {
      minLength: 2,
      maxLength: 30,
    }).filter((s) => s.trim().length > 0),
    fc.webUrl().map((url) => `${url}/poster.jpg`),
    fc.option(
      fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz "), { minLength: 5, maxLength: 50 }),
      { nil: undefined }
    )
  )
  .map(([id, type, name, poster, description]) => ({ id, type, name, poster, description }));

/**
 * Arbitrary for a boolean array of length 4 representing which sources have data.
 * [TMDB, TVDB, Cinemeta, AnimeKitsu]
 */
const availabilityPatternArb = fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean());

/**
 * Creates a mock MetadataSource that either resolves with data or returns null,
 * and tracks whether its resolve method was called.
 */
function createMockSource(
  name: string,
  hasData: boolean,
  result: StremioMetaPreview | null
): MetadataSource & { called: boolean } {
  const source: MetadataSource & { called: boolean } = {
    name,
    called: false,
    async resolve(_title: RecommendedTitle): Promise<StremioMetaPreview | null> {
      source.called = true;
      return hasData ? result : null;
    },
  };
  return source;
}

describe("Feature: stremio-ai-recommendations, Property 13: Metadata resolution waterfall and completeness", () => {
  it("priority order is respected: result comes from the first source with data (100 iterations)", () => {
    fc.assert(
      fc.asyncProperty(
        recommendedTitleArb,
        availabilityPatternArb,
        fc.array(metaPreviewArb, { minLength: 4, maxLength: 4 }),
        async (title, availability, previews) => {
          const sources = SOURCE_NAMES.map((name, i) =>
            createMockSource(name, availability[i], previews[i])
          );

          const result = await resolveMetadata(title, sources);

          const firstAvailableIndex = availability.indexOf(true);

          if (firstAvailableIndex === -1) {
            // No source has data: result must be null
            expect(result).toBeNull();
          } else {
            // Result must come from the first available source
            expect(result).not.toBeNull();
            expect(result).toEqual(previews[firstAvailableIndex]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("first match short-circuits: sources after the first match are NOT called (100 iterations)", () => {
    // Only test cases where at least one source has data
    const atLeastOneAvailableArb = availabilityPatternArb.filter(
      (pattern) => pattern.includes(true)
    );

    fc.assert(
      fc.asyncProperty(
        recommendedTitleArb,
        atLeastOneAvailableArb,
        fc.array(metaPreviewArb, { minLength: 4, maxLength: 4 }),
        async (title, availability, previews) => {
          const sources = SOURCE_NAMES.map((name, i) =>
            createMockSource(name, availability[i], previews[i])
          );

          await resolveMetadata(title, sources);

          const firstAvailableIndex = availability.indexOf(true);

          // All sources after the first match should NOT have been called
          for (let i = firstAvailableIndex + 1; i < sources.length; i++) {
            expect(sources[i].called).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("result includes id, type, name, poster fields when resolved (100 iterations)", () => {
    // Only test cases where at least one source has data
    const atLeastOneAvailableArb = availabilityPatternArb.filter(
      (pattern) => pattern.includes(true)
    );

    fc.assert(
      fc.asyncProperty(
        recommendedTitleArb,
        atLeastOneAvailableArb,
        fc.array(metaPreviewArb, { minLength: 4, maxLength: 4 }),
        async (title, availability, previews) => {
          const sources = SOURCE_NAMES.map((name, i) =>
            createMockSource(name, availability[i], previews[i])
          );

          const result = await resolveMetadata(title, sources);

          expect(result).not.toBeNull();
          expect(result!.id).toBeDefined();
          expect(typeof result!.id).toBe("string");
          expect(result!.id.length).toBeGreaterThan(0);
          expect(result!.type).toBeDefined();
          expect(result!.name).toBeDefined();
          expect(typeof result!.name).toBe("string");
          expect(result!.name.length).toBeGreaterThan(0);
          expect(result!.poster).toBeDefined();
          expect(typeof result!.poster).toBe("string");
          expect(result!.poster.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("titles with no match across all sources return null (100 iterations)", () => {
    // Force all sources to NOT have data
    const noAvailabilityArb = fc.constant([false, false, false, false] as [boolean, boolean, boolean, boolean]);

    fc.assert(
      fc.asyncProperty(
        recommendedTitleArb,
        noAvailabilityArb,
        fc.array(metaPreviewArb, { minLength: 4, maxLength: 4 }),
        async (title, availability, previews) => {
          const sources = SOURCE_NAMES.map((name, i) =>
            createMockSource(name, availability[i], previews[i])
          );

          const result = await resolveMetadata(title, sources);

          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("sources before the first match are all called (100 iterations)", () => {
    // Only test cases where at least one source has data
    const atLeastOneAvailableArb = availabilityPatternArb.filter(
      (pattern) => pattern.includes(true)
    );

    fc.assert(
      fc.asyncProperty(
        recommendedTitleArb,
        atLeastOneAvailableArb,
        fc.array(metaPreviewArb, { minLength: 4, maxLength: 4 }),
        async (title, availability, previews) => {
          const sources = SOURCE_NAMES.map((name, i) =>
            createMockSource(name, availability[i], previews[i])
          );

          await resolveMetadata(title, sources);

          const firstAvailableIndex = availability.indexOf(true);

          // All sources up to and including the first match should have been called
          for (let i = 0; i <= firstAvailableIndex; i++) {
            expect(sources[i].called).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
