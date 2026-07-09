/**
 * Unit tests for the configuration validator.
 *
 * Tests validation logic for required and optional fields,
 * ensuring field-level errors are returned for all failures.
 *
 * @requirements 3.2, 3.3, 4.1, 5.1
 */
import { describe, it, expect } from "vitest";
import {
  validateConfiguration,
  type ConfigValidationResult,
} from "../../src/services/config-validator";

/** A valid complete configuration with all fields. */
const validCompleteConfig = {
  ai_provider: "gemini",
  api_key: "sk-test-key-12345",
  languages: ["en", "fr"],
  nuvio_credentials: "nuvio-auth-token",
  fine_tuning_params: "prefer sci-fi",
  country_filter: ["US", "UK"],
  genre_exclusions: ["horror"],
  genre_preferences: ["thriller"],
};

/** A valid configuration with only required fields. */
const validMinimalConfig = {
  ai_provider: "openai",
  api_key: "my-api-key",
  languages: ["en"],
  nuvio_credentials: "nuvio-token",
};

describe("config-validator", () => {
  describe("valid configurations", () => {
    it("passes with a complete configuration (all fields)", () => {
      const result = validateConfiguration(validCompleteConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes with only required fields", () => {
      const result = validateConfiguration(validMinimalConfig);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("passes for all valid ai_provider values", () => {
      for (const provider of ["gemini", "openai", "grok"]) {
        const result = validateConfiguration({
          ...validMinimalConfig,
          ai_provider: provider,
        });
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });
  });

  describe("ai_provider validation", () => {
    it("returns error when ai_provider is missing", () => {
      const { ai_provider, ...config } = validMinimalConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "ai_provider",
        message: "ai_provider must be one of: gemini, openai, grok",
      });
    });

    it("returns error when ai_provider is invalid", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        ai_provider: "claude",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "ai_provider",
        message: "ai_provider must be one of: gemini, openai, grok",
      });
    });

    it("returns error when ai_provider is an empty string", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        ai_provider: "",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "ai_provider",
        message: "ai_provider must be one of: gemini, openai, grok",
      });
    });
  });

  describe("api_key validation", () => {
    it("returns error when api_key is missing", () => {
      const { api_key, ...config } = validMinimalConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "api_key",
        message: "api_key must be a non-empty string",
      });
    });

    it("returns error when api_key is an empty string", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        api_key: "",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "api_key",
        message: "api_key must be a non-empty string",
      });
    });

    it("returns error when api_key is only whitespace", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        api_key: "   ",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "api_key",
        message: "api_key must be a non-empty string",
      });
    });
  });

  describe("languages validation", () => {
    it("returns error when languages is missing", () => {
      const { languages, ...config } = validMinimalConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "languages",
        message: "languages must be a non-empty array with at least one string entry",
      });
    });

    it("returns error when languages is an empty array", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        languages: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "languages",
        message: "languages must be a non-empty array with at least one string entry",
      });
    });

    it("returns error when languages is not an array", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        languages: "en",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "languages",
        message: "languages must be a non-empty array with at least one string entry",
      });
    });
  });

  describe("nuvio_credentials validation", () => {
    it("returns error when nuvio_credentials is missing", () => {
      const { nuvio_credentials, ...config } = validMinimalConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "nuvio_credentials",
        message: "nuvio_credentials must be a non-empty string",
      });
    });

    it("returns error when nuvio_credentials is empty", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        nuvio_credentials: "",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "nuvio_credentials",
        message: "nuvio_credentials must be a non-empty string",
      });
    });

    it("returns error when nuvio_credentials is only whitespace", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        nuvio_credentials: "   \t  ",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "nuvio_credentials",
        message: "nuvio_credentials must be a non-empty string",
      });
    });
  });

  describe("multiple errors", () => {
    it("returns multiple errors for multiple missing fields", () => {
      const result = validateConfiguration({});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(4);

      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain("ai_provider");
      expect(fields).toContain("api_key");
      expect(fields).toContain("languages");
      expect(fields).toContain("nuvio_credentials");
    });

    it("does not short-circuit on first error", () => {
      const result = validateConfiguration({
        ai_provider: "invalid",
        api_key: "",
        languages: [],
        nuvio_credentials: "",
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(4);
    });
  });

  describe("optional fields", () => {
    it("allows omitting fine_tuning_params", () => {
      const { fine_tuning_params, ...config } = validCompleteConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("allows omitting country_filter", () => {
      const { country_filter, ...config } = validCompleteConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("allows omitting genre_exclusions", () => {
      const { genre_exclusions, ...config } = validCompleteConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("allows omitting genre_preferences", () => {
      const { genre_preferences, ...config } = validCompleteConfig;
      const result = validateConfiguration(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("allows all optional fields to be empty arrays or strings", () => {
      const result = validateConfiguration({
        ...validMinimalConfig,
        fine_tuning_params: "",
        country_filter: [],
        genre_exclusions: [],
        genre_preferences: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("returns error when input is null", () => {
      const result = validateConfiguration(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "input",
        message: "Configuration must be an object",
      });
    });

    it("returns error when input is undefined", () => {
      const result = validateConfiguration(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "input",
        message: "Configuration must be an object",
      });
    });

    it("returns error when input is an array", () => {
      const result = validateConfiguration([]);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual({
        field: "input",
        message: "Configuration must be an object",
      });
    });
  });
});
