/**
 * Property-based tests for API key never exposed in responses.
 *
 * Feature: stremio-ai-recommendations, Property 5: API key never exposed in responses
 *
 * Validates: Requirements 13.3
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  sanitizeMessage,
  errorResponse,
  configResponse,
} from "../../src/services/response-builder";
import type { UserConfiguration } from "../../src/services/configuration";

/**
 * Arbitrary that generates random API key strings (length 5-200).
 * Uses characters typical of real API keys.
 */
const apiKeyArb = fc.stringOf(
  fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:+/=".split(
      ""
    )
  ),
  { minLength: 5, maxLength: 200 }
);

/**
 * Arbitrary that generates error messages containing the API key.
 * Simulates realistic scenarios where the key might leak into error text.
 */
const errorMessageWithKeyArb = (key: string) =>
  fc.constantFrom(
    `Authentication failed for key ${key}`,
    `Invalid API key: ${key}`,
    `Provider returned error: unauthorized key=${key} is not valid`,
    `Connection refused with credentials ${key} at endpoint`,
    `Error: ${key} was rejected by the server`,
    `Request to AI provider failed. Key used: ${key}. Status: 401`,
    `${key}`,
    `Prefix text ${key} suffix text`
  );

/**
 * Arbitrary that generates a fake UserConfiguration object for configResponse tests.
 */
const userConfigArb = (maskedKey: string): fc.Arbitrary<UserConfiguration> =>
  fc.record({
    uuid: fc.uuid(),
    ai_provider: fc.constantFrom("gemini" as const, "openai" as const, "grok" as const),
    encrypted_api_key: fc.string({ minLength: 10, maxLength: 50 }),
    api_key_iv: fc.string({ minLength: 10, maxLength: 30 }),
    languages: fc.array(fc.constantFrom("en", "es", "fr", "de", "ja"), {
      minLength: 1,
      maxLength: 3,
    }),
    nuvio_credentials: fc.string({ minLength: 10, maxLength: 50 }),
    nuvio_credentials_iv: fc.string({ minLength: 10, maxLength: 30 }),
    fine_tuning_params: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    country_filter: fc.option(
      fc.array(fc.constantFrom("US", "CA", "AU", "NZ", "GB"), {
        minLength: 1,
        maxLength: 3,
      }),
      { nil: undefined }
    ),
    genre_exclusions: fc.option(
      fc.array(fc.constantFrom("horror", "thriller", "romance"), {
        minLength: 1,
        maxLength: 2,
      }),
      { nil: undefined }
    ),
    genre_preferences: fc.option(
      fc.array(fc.constantFrom("sci-fi", "comedy", "drama"), {
        minLength: 1,
        maxLength: 2,
      }),
      { nil: undefined }
    ),
    created_at: fc.constant("2024-01-01T00:00:00Z"),
    updated_at: fc.constant("2024-01-01T00:00:00Z"),
  });

describe("Feature: stremio-ai-recommendations, Property 5: API key never exposed in responses", () => {
  it("sanitizeMessage always removes the raw API key from any message (100 iterations)", () => {
    fc.assert(
      fc.property(apiKeyArb, (key) => {
        // Create various messages that contain the key
        const messages = [
          `Authentication failed for key ${key}`,
          `Invalid API key: ${key}`,
          `Error: ${key} was rejected`,
          `${key}`,
          `prefix ${key} middle ${key} suffix`,
        ];

        for (const message of messages) {
          const sanitized = sanitizeMessage(message, [key]);
          if (sanitized.includes(key)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it("errorResponse never contains the raw API key in the response body (100 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(apiKeyArb, async (key) => {
        // Build error messages that embed the key
        const errorMessages = [
          `Authentication failed for key ${key}`,
          `Provider error: ${key} is invalid`,
          `Request failed with key=${key}`,
        ];

        for (const message of errorMessages) {
          const response = errorResponse(message, 500, [key]);
          const body = await response.text();
          if (body.includes(key)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it("configResponse never contains the raw API key in the response body (100 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(
        apiKeyArb,
        async (key) => {
          // The maskedKey should be what configResponse uses, not the raw key
          const maskedKey = "*".repeat(Math.max(0, key.length - 4)) + key.slice(-4);

          const config: UserConfiguration = {
            uuid: "550e8400-e29b-41d4-a716-446655440000",
            ai_provider: "gemini",
            encrypted_api_key: "encrypted_value_here",
            api_key_iv: "iv_value_here",
            languages: ["en"],
            nuvio_credentials: "encrypted_nuvio_here",
            nuvio_credentials_iv: "nuvio_iv_here",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          };

          const response = configResponse(config, maskedKey);
          const body = await response.text();

          // The raw key should NOT appear in the body
          // (unless the masked version happens to equal the key, which is only
          // possible for keys <= 4 chars, but our key min length is 5)
          return !body.includes(key);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("sanitizeMessage handles multiple sensitive values simultaneously (100 iterations)", () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        fc.stringOf(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
          { minLength: 5, maxLength: 50 }
        ),
        (key1, key2) => {
          const message = `Error: key1=${key1} and key2=${key2} both failed`;
          const sanitized = sanitizeMessage(message, [key1, key2]);
          return !sanitized.includes(key1) && !sanitized.includes(key2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("sanitizeMessage with empty sensitive values does not alter the message (100 iterations)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (message) => {
          const sanitized = sanitizeMessage(message, [""]);
          return sanitized === message;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("errorResponse body is always valid JSON with an 'error' field (100 iterations)", async () => {
    await fc.assert(
      fc.asyncProperty(apiKeyArb, async (key) => {
        const message = `Provider error: ${key} unauthorized`;
        const response = errorResponse(message, 401, [key]);
        const body = await response.text();

        try {
          const parsed = JSON.parse(body);
          return typeof parsed.error === "string" && !parsed.error.includes(key);
        } catch {
          return false;
        }
      }),
      { numRuns: 100 }
    );
  });
});
