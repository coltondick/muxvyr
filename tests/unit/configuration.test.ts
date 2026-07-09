/**
 * Unit tests for the configuration service.
 *
 * Mocks fetch (for Supabase REST API) and uses real encryption functions
 * to test CRUD operations.
 *
 * @requirements 1.1, 2.1, 2.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createConfiguration,
  getConfiguration,
  updateConfiguration,
} from "../../src/services/configuration";
import type { CreateConfigInput } from "../../src/services/configuration";
import type { WorkerEnv } from "../../src/index";

// A valid 256-bit hex key for real encryption in tests
const VALID_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY: VALID_ENCRYPTION_KEY,
};

const mockUuid = "550e8400-e29b-41d4-a716-446655440000";

const baseInput: CreateConfigInput = {
  ai_provider: "gemini",
  api_key: "sk-test-api-key-12345",
  languages: ["en", "fr"],
  nuvio_credentials: "nuvio-auth-token-xyz",
};

describe("configuration service", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("createConfiguration", () => {
    it("encrypts credentials and returns the generated UUID", async () => {
      // Mock the Supabase response with a generated UUID
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);

        // Verify that raw credentials are NOT in the body
        expect(body).not.toHaveProperty("api_key");
        expect(body).not.toHaveProperty("nuvio_credentials_raw");

        // Verify encrypted fields are present and are non-empty strings
        expect(body.encrypted_api_key).toBeDefined();
        expect(typeof body.encrypted_api_key).toBe("string");
        expect(body.encrypted_api_key.length).toBeGreaterThan(0);
        expect(body.api_key_iv).toBeDefined();
        expect(body.nuvio_credentials).toBeDefined();
        expect(body.nuvio_credentials_iv).toBeDefined();

        // Verify the encrypted values differ from plaintext
        expect(body.encrypted_api_key).not.toBe(baseInput.api_key);
        expect(body.nuvio_credentials).not.toBe(baseInput.nuvio_credentials);

        // Verify non-encrypted fields are passed through
        expect(body.ai_provider).toBe("gemini");
        expect(body.languages).toEqual(["en", "fr"]);

        // Return mock response with UUID
        return new Response(
          JSON.stringify([
            {
              uuid: mockUuid,
              ...body,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            },
          ]),
          { status: 201 }
        );
      });

      const result = await createConfiguration(baseInput, mockEnv);

      expect(result).toBe(mockUuid);

      // Verify fetch was called with correct Supabase URL and method
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://test.supabase.co/rest/v1/user_configurations"
      );
      expect(options.method).toBe("POST");
      expect(options.headers.apikey).toBe("test-service-key");
      expect(options.headers.Authorization).toBe(
        "Bearer test-service-key"
      );
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.headers.Prefer).toBe("return=representation");
    });

    it("includes optional fields when provided", async () => {
      const inputWithOptionals: CreateConfigInput = {
        ...baseInput,
        fine_tuning_params: "prefer sci-fi",
        country_filter: ["US", "UK"],
        genre_exclusions: ["horror"],
        genre_preferences: ["thriller", "drama"],
      };

      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        expect(body.fine_tuning_params).toBe("prefer sci-fi");
        expect(body.country_filter).toEqual(["US", "UK"]);
        expect(body.genre_exclusions).toEqual(["horror"]);
        expect(body.genre_preferences).toEqual(["thriller", "drama"]);

        return new Response(
          JSON.stringify([{ uuid: mockUuid, ...body }]),
          { status: 201 }
        );
      });

      const result = await createConfiguration(inputWithOptionals, mockEnv);
      expect(result).toBe(mockUuid);
    });

    it("throws when Supabase returns an error", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "DB error" }), { status: 500 })
      );

      await expect(createConfiguration(baseInput, mockEnv)).rejects.toThrow(
        "Failed to create configuration: 500"
      );
    });
  });

  describe("getConfiguration", () => {
    it("returns the configuration for a valid UUID", async () => {
      const storedConfig = {
        uuid: mockUuid,
        ai_provider: "gemini",
        encrypted_api_key: "some-encrypted-data",
        api_key_iv: "some-iv",
        languages: ["en"],
        nuvio_credentials: "encrypted-nuvio",
        nuvio_credentials_iv: "nuvio-iv",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([storedConfig]), { status: 200 })
      );

      const result = await getConfiguration(mockUuid, mockEnv);

      expect(result).toEqual(storedConfig);

      // Verify the GET request URL and headers
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `https://test.supabase.co/rest/v1/user_configurations?uuid=eq.${mockUuid}`
      );
      expect(options.method).toBe("GET");
      expect(options.headers.apikey).toBe("test-service-key");
    });

    it("returns null for a non-existent UUID", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      const result = await getConfiguration(
        "00000000-0000-4000-8000-000000000000",
        mockEnv
      );

      expect(result).toBeNull();
    });

    it("throws when Supabase returns an error status", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      await expect(getConfiguration(mockUuid, mockEnv)).rejects.toThrow(
        "Failed to fetch configuration: 401"
      );
    });
  });

  describe("updateConfiguration", () => {
    it("re-encrypts api_key when changed", async () => {
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);

        // Verify encrypted API key fields are present
        expect(body.encrypted_api_key).toBeDefined();
        expect(typeof body.encrypted_api_key).toBe("string");
        expect(body.encrypted_api_key.length).toBeGreaterThan(0);
        expect(body.api_key_iv).toBeDefined();
        expect(typeof body.api_key_iv).toBe("string");

        // Verify the encrypted value differs from plaintext
        expect(body.encrypted_api_key).not.toBe("new-api-key-value");

        return new Response(
          JSON.stringify([{ uuid: mockUuid, ...body }]),
          { status: 200 }
        );
      });

      const result = await updateConfiguration(
        mockUuid,
        { api_key: "new-api-key-value" },
        mockEnv
      );

      expect(result).toBe(true);

      // Verify PATCH request to the correct endpoint
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `https://test.supabase.co/rest/v1/user_configurations?uuid=eq.${mockUuid}`
      );
      expect(options.method).toBe("PATCH");
    });

    it("skips encryption when api_key is not provided", async () => {
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);

        // Should NOT have encrypted key fields
        expect(body).not.toHaveProperty("encrypted_api_key");
        expect(body).not.toHaveProperty("api_key_iv");

        // Should have the non-encrypted updated fields
        expect(body.ai_provider).toBe("openai");
        expect(body.languages).toEqual(["en", "de"]);

        return new Response(
          JSON.stringify([{ uuid: mockUuid, ...body }]),
          { status: 200 }
        );
      });

      const result = await updateConfiguration(
        mockUuid,
        { ai_provider: "openai", languages: ["en", "de"] },
        mockEnv
      );

      expect(result).toBe(true);
    });

    it("returns false when UUID is not found (empty response)", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      const result = await updateConfiguration(
        "00000000-0000-4000-8000-000000000000",
        { ai_provider: "grok" },
        mockEnv
      );

      expect(result).toBe(false);
    });

    it("returns true when no fields are provided (no-op update)", async () => {
      const result = await updateConfiguration(mockUuid, {}, mockEnv);

      expect(result).toBe(true);
      // fetch should NOT be called when there's nothing to update
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws when Supabase returns an error", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      await expect(
        updateConfiguration(mockUuid, { ai_provider: "grok" }, mockEnv)
      ).rejects.toThrow("Failed to update configuration: 500");
    });

    it("re-encrypts nuvio_credentials when provided", async () => {
      fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);

        // Verify encrypted Nuvio fields are present
        expect(body.nuvio_credentials).toBeDefined();
        expect(typeof body.nuvio_credentials).toBe("string");
        expect(body.nuvio_credentials.length).toBeGreaterThan(0);
        expect(body.nuvio_credentials_iv).toBeDefined();

        // Verify the encrypted value differs from plaintext
        expect(body.nuvio_credentials).not.toBe("new-nuvio-token");

        return new Response(
          JSON.stringify([{ uuid: mockUuid, ...body }]),
          { status: 200 }
        );
      });

      const result = await updateConfiguration(
        mockUuid,
        { nuvio_credentials: "new-nuvio-token" },
        mockEnv
      );

      expect(result).toBe(true);
    });
  });
});
