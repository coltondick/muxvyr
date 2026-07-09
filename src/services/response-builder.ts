/**
 * Response Builder Service
 *
 * Constructs HTTP responses and sanitizes sensitive values.
 *
 * @module response-builder
 */

import { maskApiKey } from "./api-key-masking.js";
import type { UserConfiguration } from "./configuration.js";

/**
 * Sanitizes a message by replacing all occurrences of sensitive values with "[REDACTED]".
 */
export function sanitizeMessage(
  message: string,
  sensitiveValues: string[]
): string {
  let sanitized = message;
  for (const value of sensitiveValues) {
    if (value.length === 0) continue;
    while (sanitized.includes(value)) {
      sanitized = sanitized.replace(value, "[REDACTED]");
    }
  }
  return sanitized;
}

/**
 * Creates a JSON response with proper Content-Type header.
 */
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Creates an error JSON response, sanitizing the message.
 */
export function errorResponse(
  message: string,
  status: number,
  sensitiveValues: string[] = []
): Response {
  const sanitizedMessage = sanitizeMessage(message, sensitiveValues);
  return new Response(JSON.stringify({ error: sanitizedMessage }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Creates a configuration response with the API key masked for safe display.
 */
export function configResponse(
  config: UserConfiguration,
  apiKeyMasked: string
): Response {
  const safeConfig = {
    uuid: config.uuid,
    ai_provider: config.ai_provider,
    api_key: apiKeyMasked,
    languages: config.languages,
    fine_tuning_params: config.fine_tuning_params,
    country_filter: config.country_filter,
    genre_exclusions: config.genre_exclusions,
    genre_preferences: config.genre_preferences,
    created_at: config.created_at,
    updated_at: config.updated_at,
  };

  return new Response(JSON.stringify(safeConfig), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
