/**
 * Property-based tests for API key masking.
 *
 * Feature: stremio-ai-recommendations, Property 4: API key masking
 *
 * Validates: Requirements 3.5
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { maskApiKey } from "../../src/services/api-key-masking";

/**
 * Arbitrary that generates random strings of length 0 to 256 characters,
 * simulating API keys of varying lengths.
 */
const apiKeyArb = fc.string({ minLength: 0, maxLength: 256 });

/**
 * Arbitrary for keys that are shorter than 4 characters (1-3).
 */
const shortKeyArb = fc.string({ minLength: 1, maxLength: 3 });

/**
 * Arbitrary for keys that are at least 4 characters long.
 */
const longKeyArb = fc.string({ minLength: 4, maxLength: 256 });

describe("Feature: stremio-ai-recommendations, Property 4: API key masking", () => {
  it("masked length always equals original length (100 iterations)", () => {
    fc.assert(
      fc.property(apiKeyArb, (key) => {
        const masked = maskApiKey(key);
        return masked.length === key.length;
      }),
      { numRuns: 100 }
    );
  });

  it("for keys of length >= 4, last 4 chars of masked result match last 4 of original (100 iterations)", () => {
    fc.assert(
      fc.property(longKeyArb, (key) => {
        const masked = maskApiKey(key);
        const lastFourMasked = masked.slice(-4);
        const lastFourOriginal = key.slice(-4);
        return lastFourMasked === lastFourOriginal;
      }),
      { numRuns: 100 }
    );
  });

  it("for keys of length >= 4, all preceding characters are '*' (100 iterations)", () => {
    fc.assert(
      fc.property(longKeyArb, (key) => {
        const masked = maskApiKey(key);
        const precedingChars = masked.slice(0, -4);
        return precedingChars.split("").every((ch) => ch === "*");
      }),
      { numRuns: 100 }
    );
  });

  it("for keys of length < 4 and > 0, all characters are '*' (100 iterations)", () => {
    fc.assert(
      fc.property(shortKeyArb, (key) => {
        const masked = maskApiKey(key);
        return masked.split("").every((ch) => ch === "*");
      }),
      { numRuns: 100 }
    );
  });

  it("for empty strings, result is empty (100 iterations)", () => {
    // This is a deterministic property but we validate it through the framework
    fc.assert(
      fc.property(fc.constant(""), (key) => {
        const masked = maskApiKey(key);
        return masked === "";
      }),
      { numRuns: 100 }
    );
  });

  it("masked result never exposes original characters in the masked portion for keys >= 4 (100 iterations)", () => {
    fc.assert(
      fc.property(longKeyArb, (key) => {
        const masked = maskApiKey(key);
        const maskedPortion = masked.slice(0, -4);
        // Every character in the masked portion must be '*'
        // and must NOT be the original character (unless original was also '*')
        return maskedPortion.split("").every((ch) => ch === "*");
      }),
      { numRuns: 100 }
    );
  });
});
