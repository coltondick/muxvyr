/**
 * Property-based tests for system prompt construction.
 *
 * Feature: stremio-ai-recommendations, Property 6: System prompt construction completeness
 *
 * Validates: Requirements 4.2, 5.3, 6.2, 7.1, 8.1, 9.1, 10.1
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildSystemPrompt, PromptContext } from "../../src/services/prompt-builder";

/**
 * Arbitrary for a non-empty title string (simulates watch history entries).
 * Uses alphanumeric characters to avoid regex issues in assertions.
 */
const titleArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "), {
    minLength: 3,
    maxLength: 40,
  })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for a language string (simulates ISO 639-1 codes or language names).
 */
const languageArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), {
    minLength: 2,
    maxLength: 10,
  })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for a watch history list (1-20 titles).
 */
const watchHistoryArb = fc.array(titleArb, { minLength: 1, maxLength: 20 });

/**
 * Arbitrary for a languages list (1-5 languages).
 */
const languagesArb = fc.array(languageArb, { minLength: 1, maxLength: 5 });

/**
 * Arbitrary for fine-tuning parameters (string or undefined).
 */
const fineTuningParamsArb = fc.option(
  fc
    .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789 "), {
      minLength: 3,
      maxLength: 50,
    })
    .filter((s) => s.trim().length > 0),
  { nil: undefined }
);

/**
 * Arbitrary for a country code (ISO 3166-1 alpha-2 style).
 */
const countryCodeArb = fc
  .stringOf(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"), {
    minLength: 2,
    maxLength: 2,
  });

/**
 * Arbitrary for country filter (array or undefined).
 */
const countryFilterArb = fc.option(
  fc.array(countryCodeArb, { minLength: 1, maxLength: 5 }),
  { nil: undefined }
);

/**
 * Arbitrary for a genre name.
 */
const genreArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz"), {
    minLength: 3,
    maxLength: 15,
  })
  .filter((s) => s.trim().length > 0);

/**
 * Arbitrary for genre exclusions (array or undefined).
 */
const genreExclusionsArb = fc.option(
  fc.array(genreArb, { minLength: 1, maxLength: 5 }),
  { nil: undefined }
);

/**
 * Arbitrary for genre preferences (array or undefined).
 */
const genrePreferencesArb = fc.option(
  fc.array(genreArb, { minLength: 1, maxLength: 5 }),
  { nil: undefined }
);

/**
 * Arbitrary for catalog type.
 */
const catalogTypeArb = fc.constantFrom("general", "because-you-watched") as fc.Arbitrary<
  "general" | "because-you-watched"
>;

/**
 * Arbitrary for a reference title for BYW.
 */
const referenceTitleForBywArb = fc.option(titleArb, { nil: undefined });

/**
 * Arbitrary for a complete PromptContext object with all field combinations.
 */
const promptContextArb = fc
  .tuple(
    watchHistoryArb,
    languagesArb,
    fineTuningParamsArb,
    countryFilterArb,
    genreExclusionsArb,
    genrePreferencesArb,
    catalogTypeArb,
    referenceTitleForBywArb
  )
  .map(
    ([
      watchHistory,
      languages,
      fineTuningParams,
      countryFilter,
      genreExclusions,
      genrePreferences,
      catalogType,
      referenceTitleForByw,
    ]): PromptContext => ({
      watchHistory,
      languages,
      fineTuningParams,
      countryFilter,
      genreExclusions,
      genrePreferences,
      catalogType,
      referenceTitleForByw,
    })
  );

describe("Feature: stremio-ai-recommendations, Property 6: System prompt construction completeness", () => {
  it("all watch history titles appear in the constructed prompt (100 iterations)", () => {
    fc.assert(
      fc.property(promptContextArb, (context) => {
        const prompt = buildSystemPrompt(context);

        for (const title of context.watchHistory) {
          expect(prompt).toContain(title);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all languages appear in the constructed prompt (100 iterations)", () => {
    fc.assert(
      fc.property(promptContextArb, (context) => {
        const prompt = buildSystemPrompt(context);

        for (const language of context.languages) {
          expect(prompt).toContain(language);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("fineTuningParams appears in prompt when set (100 iterations)", () => {
    const contextWithFineTuning = promptContextArb.filter(
      (ctx) => ctx.fineTuningParams !== undefined && ctx.fineTuningParams.trim().length > 0
    );

    fc.assert(
      fc.property(contextWithFineTuning, (context) => {
        const prompt = buildSystemPrompt(context);
        expect(prompt).toContain(context.fineTuningParams!);
      }),
      { numRuns: 100 }
    );
  });

  it("all country filter entries appear in prompt when set and non-empty (100 iterations)", () => {
    const contextWithCountryFilter = promptContextArb.filter(
      (ctx) => ctx.countryFilter !== undefined && ctx.countryFilter.length > 0
    );

    fc.assert(
      fc.property(contextWithCountryFilter, (context) => {
        const prompt = buildSystemPrompt(context);

        for (const country of context.countryFilter!) {
          expect(prompt).toContain(country);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all genre exclusion entries appear in prompt when set and non-empty (100 iterations)", () => {
    const contextWithGenreExclusions = promptContextArb.filter(
      (ctx) => ctx.genreExclusions !== undefined && ctx.genreExclusions.length > 0
    );

    fc.assert(
      fc.property(contextWithGenreExclusions, (context) => {
        const prompt = buildSystemPrompt(context);

        for (const genre of context.genreExclusions!) {
          expect(prompt).toContain(genre);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("all genre preference entries appear in prompt when set and non-empty (100 iterations)", () => {
    const contextWithGenrePreferences = promptContextArb.filter(
      (ctx) => ctx.genrePreferences !== undefined && ctx.genrePreferences.length > 0
    );

    fc.assert(
      fc.property(contextWithGenrePreferences, (context) => {
        const prompt = buildSystemPrompt(context);

        for (const genre of context.genrePreferences!) {
          expect(prompt).toContain(genre);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("reference title for BYW appears in prompt when catalogType is because-you-watched and title is set (100 iterations)", () => {
    const contextWithByw = promptContextArb
      .map((ctx) => ({
        ...ctx,
        catalogType: "because-you-watched" as const,
        referenceTitleForByw: ctx.referenceTitleForByw ?? "Some Reference Title",
      }));

    fc.assert(
      fc.property(contextWithByw, (context) => {
        const prompt = buildSystemPrompt(context);
        expect(prompt).toContain(context.referenceTitleForByw!);
      }),
      { numRuns: 100 }
    );
  });

  it("combined: all configured optional fields are included in the prompt (100 iterations)", () => {
    fc.assert(
      fc.property(promptContextArb, (context) => {
        const prompt = buildSystemPrompt(context);

        // All watch history titles must appear
        for (const title of context.watchHistory) {
          expect(prompt).toContain(title);
        }

        // All languages must appear
        for (const language of context.languages) {
          expect(prompt).toContain(language);
        }

        // Fine-tuning params must appear when set
        if (context.fineTuningParams) {
          expect(prompt).toContain(context.fineTuningParams);
        }

        // Country filter entries must appear when set and non-empty
        if (context.countryFilter && context.countryFilter.length > 0) {
          for (const country of context.countryFilter) {
            expect(prompt).toContain(country);
          }
        }

        // Genre exclusions must appear when set and non-empty
        if (context.genreExclusions && context.genreExclusions.length > 0) {
          for (const genre of context.genreExclusions) {
            expect(prompt).toContain(genre);
          }
        }

        // Genre preferences must appear when set and non-empty
        if (context.genrePreferences && context.genrePreferences.length > 0) {
          for (const genre of context.genrePreferences) {
            expect(prompt).toContain(genre);
          }
        }

        // BYW reference title must appear for because-you-watched catalogs
        if (context.catalogType === "because-you-watched" && context.referenceTitleForByw) {
          expect(prompt).toContain(context.referenceTitleForByw);
        }
      }),
      { numRuns: 100 }
    );
  });
});
