/**
 * Configuration Validator
 *
 * Validates user configuration input before persistence.
 * Returns field-level error details for all validation failures at once.
 *
 * @module config-validator
 * @requirements 3.2, 3.3, 4.1, 5.1
 */

/**
 * Represents a single field-level validation error.
 */
export type ValidationError = {
  field: string;
  message: string;
};

/**
 * Result of configuration validation.
 */
export type ConfigValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/** Valid AI provider values. */
const VALID_AI_PROVIDERS = ["gemini", "openai", "grok"] as const;

/**
 * Validates a configuration input object.
 *
 * Checks all required fields and collects all errors (does not short-circuit).
 * Optional fields (fine_tuning_params, country_filter, genre_exclusions,
 * genre_preferences) are not validated for presence.
 *
 * @param input - Unknown input to validate
 * @returns Validation result with field-level errors
 */
export function validateConfiguration(input: unknown): ConfigValidationResult {
  const errors: ValidationError[] = [];

  // Check input is an object
  if (input === null || input === undefined || typeof input !== "object" || Array.isArray(input)) {
    return {
      valid: false,
      errors: [{ field: "input", message: "Configuration must be an object" }],
    };
  }

  const config = input as Record<string, unknown>;

  // Validate ai_provider
  if (
    config.ai_provider === undefined ||
    config.ai_provider === null ||
    !VALID_AI_PROVIDERS.includes(config.ai_provider as typeof VALID_AI_PROVIDERS[number])
  ) {
    errors.push({
      field: "ai_provider",
      message: "ai_provider must be one of: gemini, openai, grok",
    });
  }

  // Validate api_key
  if (
    config.api_key === undefined ||
    config.api_key === null ||
    typeof config.api_key !== "string" ||
    config.api_key.trim().length === 0
  ) {
    errors.push({
      field: "api_key",
      message: "api_key must be a non-empty string",
    });
  }

  // Validate languages
  if (
    config.languages === undefined ||
    config.languages === null ||
    !Array.isArray(config.languages) ||
    config.languages.length === 0 ||
    !config.languages.some((lang) => typeof lang === "string" && lang.trim().length > 0)
  ) {
    errors.push({
      field: "languages",
      message: "languages must be a non-empty array with at least one string entry",
    });
  }

  // Validate nuvio_credentials
  if (
    config.nuvio_credentials === undefined ||
    config.nuvio_credentials === null ||
    typeof config.nuvio_credentials !== "string" ||
    config.nuvio_credentials.trim().length === 0
  ) {
    errors.push({
      field: "nuvio_credentials",
      message: "nuvio_credentials must be a non-empty string",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
