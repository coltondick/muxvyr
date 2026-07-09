/**
 * Unit tests for the Response Builder Service
 *
 * Verifies that responses are properly constructed with correct headers
 * and that sensitive values are never exposed in response bodies.
 *
 * @requirements 13.3
 */

import { describe, it, expect } from "vitest";
import {
  jsonResponse,
  errorResponse,
  configResponse,
  sanitizeMessage,
} from "../../src/services/response-builder";
import type { UserConfiguration } from "../../src/services/configuration";

describe("Response Builder", () => {
  describe("jsonResponse", () => {
    it("creates a response with Content-Type application/json", async () => {
      const response = jsonResponse({ hello: "world" });

      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("defaults to status 200", () => {
      const response = jsonResponse({ ok: true });

      expect(response.status).toBe(200);
    });

    it("uses the provided status code", () => {
      const response = jsonResponse({ created: true }, 201);

      expect(response.status).toBe(201);
    });

    it("serializes the data as JSON in the body", async () => {
      const data = { items: [1, 2, 3], nested: { key: "value" } };
      const response = jsonResponse(data);
      const body = await response.json();

      expect(body).toEqual(data);
    });

    it("handles null data", async () => {
      const response = jsonResponse(null);
      const body = await response.json();

      expect(body).toBeNull();
    });
  });

  describe("errorResponse", () => {
    it("creates a JSON error response with the given status", async () => {
      const response = errorResponse("Not found", 404);

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const body = await response.json();
      expect(body).toEqual({ error: "Not found" });
    });

    it("sanitizes sensitive values from the error message", async () => {
      const apiKey = "sk-abc123xyz789";
      const message = `AI provider error: Invalid key sk-abc123xyz789 for account`;
      const response = errorResponse(message, 502, [apiKey]);
      const body = (await response.json()) as { error: string };

      expect(body.error).not.toContain(apiKey);
      expect(body.error).toContain("[REDACTED]");
    });

    it("sanitizes multiple sensitive values", async () => {
      const apiKey = "sk-secret123";
      const dbCredential = "postgres://admin:password@host";
      const message = `Error with key sk-secret123 and connection postgres://admin:password@host failed`;
      const response = errorResponse(message, 500, [apiKey, dbCredential]);
      const body = (await response.json()) as { error: string };

      expect(body.error).not.toContain(apiKey);
      expect(body.error).not.toContain(dbCredential);
      expect(body.error).toContain("[REDACTED]");
    });

    it("leaves message unchanged when sensitiveValues is empty", async () => {
      const message = "Something went wrong";
      const response = errorResponse(message, 500, []);
      const body = (await response.json()) as { error: string };

      expect(body.error).toBe(message);
    });

    it("leaves message unchanged when sensitiveValues is not provided", async () => {
      const message = "Internal server error";
      const response = errorResponse(message, 500);
      const body = (await response.json()) as { error: string };

      expect(body.error).toBe(message);
    });
  });

  describe("configResponse", () => {
    const mockConfig: UserConfiguration = {
      uuid: "550e8400-e29b-41d4-a716-446655440000",
      ai_provider: "openai",
      encrypted_api_key: "encrypted_base64_data",
      api_key_iv: "iv_base64_data",
      languages: ["en", "es"],
      nuvio_credentials: "encrypted_nuvio_data",
      nuvio_credentials_iv: "nuvio_iv_data",
      fine_tuning_params: "prefer sci-fi",
      country_filter: ["US", "UK"],
      genre_exclusions: ["horror"],
      genre_preferences: ["sci-fi", "thriller"],
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };

    it("uses the masked API key instead of encrypted key", async () => {
      const maskedKey = "****abcd";
      const response = configResponse(mockConfig, maskedKey);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body.api_key).toBe(maskedKey);
      expect(JSON.stringify(body)).not.toContain("encrypted_base64_data");
    });

    it("does not include encrypted_api_key or api_key_iv in response", async () => {
      const maskedKey = "****1234";
      const response = configResponse(mockConfig, maskedKey);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body).not.toHaveProperty("encrypted_api_key");
      expect(body).not.toHaveProperty("api_key_iv");
    });

    it("does not include nuvio credentials in response", async () => {
      const maskedKey = "****1234";
      const response = configResponse(mockConfig, maskedKey);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body).not.toHaveProperty("nuvio_credentials");
      expect(body).not.toHaveProperty("nuvio_credentials_iv");
    });

    it("includes non-sensitive configuration fields", async () => {
      const maskedKey = "****1234";
      const response = configResponse(mockConfig, maskedKey);
      const body = (await response.json()) as Record<string, unknown>;

      expect(body.uuid).toBe(mockConfig.uuid);
      expect(body.ai_provider).toBe(mockConfig.ai_provider);
      expect(body.languages).toEqual(mockConfig.languages);
      expect(body.fine_tuning_params).toBe(mockConfig.fine_tuning_params);
      expect(body.country_filter).toEqual(mockConfig.country_filter);
      expect(body.genre_exclusions).toEqual(mockConfig.genre_exclusions);
      expect(body.genre_preferences).toEqual(mockConfig.genre_preferences);
    });

    it("returns status 200 with JSON content type", () => {
      const maskedKey = "****abcd";
      const response = configResponse(mockConfig, maskedKey);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("sanitizeMessage", () => {
    it("removes all occurrences of a sensitive value", () => {
      const message = "Key abc123 failed, tried abc123 again";
      const result = sanitizeMessage(message, ["abc123"]);

      expect(result).not.toContain("abc123");
      expect(result).toBe("Key [REDACTED] failed, tried [REDACTED] again");
    });

    it("removes multiple different sensitive values", () => {
      const message = "Error with key1 and key2 in system";
      const result = sanitizeMessage(message, ["key1", "key2"]);

      expect(result).not.toContain("key1");
      expect(result).not.toContain("key2");
      expect(result).toBe(
        "Error with [REDACTED] and [REDACTED] in system"
      );
    });

    it("leaves message unchanged when sensitive values list is empty", () => {
      const message = "No secrets here";
      const result = sanitizeMessage(message, []);

      expect(result).toBe(message);
    });

    it("leaves message unchanged when no sensitive values match", () => {
      const message = "Everything is fine";
      const result = sanitizeMessage(message, ["xyz999"]);

      expect(result).toBe(message);
    });

    it("handles empty strings in sensitive values array gracefully", () => {
      const message = "Some message";
      const result = sanitizeMessage(message, ["", "secret"]);

      expect(result).toBe("Some message");
    });

    it("handles sensitive value that is the entire message", () => {
      const secret = "my-entire-secret-message";
      const result = sanitizeMessage(secret, [secret]);

      expect(result).toBe("[REDACTED]");
    });
  });
});
