/**
 * Property-based tests for configuration validation.
 *
 * Feature: stremio-ai-recommendations, Property 2: Configuration validation rejects incomplete submissions
 *
 * Validates: Requirements 3.2, 3.3, 4.1, 5.1
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validateConfiguration } from "../../src/services/config-validator";

/** Valid AI provider values matching the validator. */
const VALID_PROVIDERS = ["gemini", "openai", "grok"] as const;

/**
 * Arbitrary for a valid AI provider value.
 */
const validProviderArb = fc.constantFrom(...VALID_PROVIDERS);

/**
 * Arbitrary for a non-empty trimmed string (simulates valid API keys / credentials).
 */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0
);

/**
 * Arbitrary for a valid languages array (non-empty, at least one non-empty string).
 */
const validLanguagesArb = fc
  .array(nonEmptyStringArb, { minLength: 1, maxLength: 10 })
  .filter((arr) => arr.some((s) => s.trim().length > 0));

/**
 * Arbitrary for a fully valid configuration object (all required fields present).
 */
const validConfigArb = fc.record({
  ai_provider: validProviderArb,
  api_key: nonEmptyStringArb,
  languages: validLanguagesArb,
  nuvio_credentials: nonEmptyStringArb,
});

/**
 * Arbitrary for optional fields that may or may not be present.
 */
const optionalFieldsArb = fc.record(
  {
    fine_tuning_params: fc.string({ minLength: 0, maxLength: 100 }),
    country_filter: fc.array(fc.string({ minLength: 1, maxLength: 5 }), {
      minLength: 0,
      maxLength: 5,
    }),
    genre_exclusions: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
    genre_preferences: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 5,
    }),
  },
  { requiredKeys: [] }
);

/**
 * Arbitrary for an invalid AI provider (not one of the three valid values).
 */
const invalidProviderArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => !VALID_PROVIDERS.includes(s as typeof VALID_PROVIDERS[number]));

/**
 * Arbitrary for an invalid API key (empty or whitespace-only).
 */
const invalidApiKeyArb = fc.constantFrom("", "   ", "\t", "\n", "  \t\n  ");

/**
 * Arbitrary for an invalid languages value (empty array or array of empty/whitespace strings).
 */
const invalidLanguagesArb = fc.constantFrom(
  [],
  [""],
  ["   "],
  ["\t", "\n"],
  ["", "   ", "\t"]
);

/**
 * Arbitrary for an invalid nuvio_credentials (empty or whitespace-only).
 */
const invalidNuvioCredsArb = fc.constantFrom("", "   ", "\t", "\n", " \t\n ");

describe("Feature: stremio-ai-recommendations, Property 2: Configuration validation rejects incomplete submissions", () => {
  it("valid configurations with all required fields pass validation (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, optionalFieldsArb, (config, optional) => {
        const input = { ...config, ...optional };
        const result = validateConfiguration(input);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with invalid ai_provider are rejected with field error (100 iterations)", () => {
    fc.assert(
      fc.property(
        validConfigArb,
        invalidProviderArb,
        (config, badProvider) => {
          const input = { ...config, ai_provider: badProvider };
          const result = validateConfiguration(input);
          expect(result.valid).toBe(false);
          expect(result.errors.some((e) => e.field === "ai_provider")).toBe(true);
          const err = result.errors.find((e) => e.field === "ai_provider");
          expect(err!.message.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("configurations with missing ai_provider are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        const { ai_provider, ...rest } = config;
        const result = validateConfiguration(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === "ai_provider")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with invalid api_key (empty/whitespace) are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, invalidApiKeyArb, (config, badKey) => {
        const input = { ...config, api_key: badKey };
        const result = validateConfiguration(input);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === "api_key")).toBe(true);
        const err = result.errors.find((e) => e.field === "api_key");
        expect(err!.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with missing api_key are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        const { api_key, ...rest } = config;
        const result = validateConfiguration(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === "api_key")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with invalid languages (empty array or all-whitespace entries) are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, invalidLanguagesArb, (config, badLangs) => {
        const input = { ...config, languages: badLangs };
        const result = validateConfiguration(input);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === "languages")).toBe(true);
        const err = result.errors.find((e) => e.field === "languages");
        expect(err!.message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with missing languages are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        const { languages, ...rest } = config;
        const result = validateConfiguration(rest);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.field === "languages")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations with invalid nuvio_credentials (empty/whitespace) are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(
        validConfigArb,
        invalidNuvioCredsArb,
        (config, badCreds) => {
          const input = { ...config, nuvio_credentials: badCreds };
          const result = validateConfiguration(input);
          expect(result.valid).toBe(false);
          expect(
            result.errors.some((e) => e.field === "nuvio_credentials")
          ).toBe(true);
          const err = result.errors.find(
            (e) => e.field === "nuvio_credentials"
          );
          expect(err!.message.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("configurations with missing nuvio_credentials are rejected (100 iterations)", () => {
    fc.assert(
      fc.property(validConfigArb, (config) => {
        const { nuvio_credentials, ...rest } = config;
        const result = validateConfiguration(rest);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.field === "nuvio_credentials")
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("configurations missing random combinations of required fields report all missing fields (100 iterations)", () => {
    const requiredFields = [
      "ai_provider",
      "api_key",
      "languages",
      "nuvio_credentials",
    ] as const;

    // Generate a non-empty subset of fields to remove
    const fieldsToRemoveArb = fc
      .subarray([...requiredFields], { minLength: 1, maxLength: 4 })
      .filter((arr) => arr.length > 0);

    fc.assert(
      fc.property(validConfigArb, fieldsToRemoveArb, (config, fieldsToRemove) => {
        const input: Record<string, unknown> = { ...config };
        for (const field of fieldsToRemove) {
          delete input[field];
        }
        const result = validateConfiguration(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(fieldsToRemove.length);
        for (const field of fieldsToRemove) {
          expect(result.errors.some((e) => e.field === field)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("non-object inputs are rejected with descriptive error (100 iterations)", () => {
    const nonObjectArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      fc.array(fc.anything())
    );

    fc.assert(
      fc.property(nonObjectArb, (input) => {
        const result = validateConfiguration(input);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].message.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
