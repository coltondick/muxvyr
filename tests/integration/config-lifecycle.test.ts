/**
 * Integration tests for configuration lifecycle.
 *
 * Tests: create config → retrieve config → update config → verify cache invalidation.
 * Verifies UUID generation, encrypted storage, masked retrieval, and update persistence.
 *
 * @requirements 1.1, 2.1, 2.2, 12.3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleCreateConfigure, handleGetConfigure, handlePostConfigure } from "../../src/handlers/configure";
import type { WorkerEnv } from "../../src/index";

const ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_KEY: "test-service-key",
  UPSTASH_REDIS_URL: "https://test-redis.upstash.io",
  UPSTASH_REDIS_TOKEN: "test-redis-token",
  ENCRYPTION_KEY,
};

/**
 * Helper to encrypt a value for mock Supabase responses.
 */
async function encryptValue(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const keyBuffer = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    keyBuffer[i] = parseInt(ENCRYPTION_KEY.substring(i * 2, i * 2 + 2), 16);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plaintext)
  );
  const ciphertext = btoa(String.fromCharCode(...new Uint8Array(encrypted)));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  return { ciphertext, iv: ivBase64 };
}

describe("Configuration Lifecycle Integration", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Create Configuration", () => {
    it("creates a new configuration and returns UUID and manifest URL", async () => {
      let storedBody: Record<string, unknown> | null = null;

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        // Supabase POST (create)
        if (urlStr.includes("supabase.co") && init?.method === "POST") {
          storedBody = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify([{
              uuid: TEST_UUID,
              ...storedBody,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            }]),
            { status: 201, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response("", { status: 404 });
      });

      const requestBody = {
        ai_provider: "openai",
        api_key: "sk-real-api-key-1234567890",
        languages: ["en", "es"],
        nuvio_credentials: "nuvio-secret-token-abc",
        fine_tuning_params: "Prefer sci-fi and drama",
      };

      const request = new Request("https://muxvyr.com/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const response = await handleCreateConfigure(request, mockEnv);
      const body = await response.json() as { uuid: string; manifest_url: string; message: string };

      expect(response.status).toBe(201);
      expect(body.uuid).toBe(TEST_UUID);
      expect(body.manifest_url).toContain(TEST_UUID);
      expect(body.manifest_url).toContain("manifest.json");

      // Verify the stored body has encrypted values (not plaintext)
      expect(storedBody).not.toBeNull();
      expect(storedBody!.encrypted_api_key).toBeDefined();
      expect(storedBody!.api_key_iv).toBeDefined();
      expect(storedBody!.encrypted_api_key).not.toBe("sk-real-api-key-1234567890");
      expect(storedBody!.nuvio_credentials).not.toBe("nuvio-secret-token-abc");
    });

    it("stores encrypted API key (not plaintext) in Supabase", async () => {
      let insertedData: Record<string, unknown> | null = null;

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("supabase.co") && init?.method === "POST") {
          insertedData = JSON.parse(init.body as string);
          return new Response(
            JSON.stringify([{
              uuid: TEST_UUID,
              ...insertedData,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
            }]),
            { status: 201 }
          );
        }

        return new Response("", { status: 404 });
      });

      const request = new Request("https://muxvyr.com/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_provider: "gemini",
          api_key: "AIzaSyB-plaintext-key-that-should-be-encrypted",
          languages: ["en"],
          nuvio_credentials: "nuvio-cred-plaintext",
        }),
      });

      await handleCreateConfigure(request, mockEnv);

      // The stored data must have encrypted_api_key (base64) and api_key_iv, not the raw key
      expect(insertedData).not.toBeNull();
      expect(insertedData!.encrypted_api_key).toBeDefined();
      expect(insertedData!.api_key_iv).toBeDefined();
      // Plaintext should NOT appear
      expect(JSON.stringify(insertedData)).not.toContain("AIzaSyB-plaintext-key-that-should-be-encrypted");
    });
  });

  describe("Retrieve Configuration", () => {
    it("returns masked API key on GET (not the raw key)", async () => {
      const encryptedApiKey = await encryptValue("sk-real-secret-key-ABCDEF1234");
      const encryptedNuvio = await encryptValue(JSON.stringify({ email: "user@test.com", password: "pass123" }));

      const mockConfig = {
        uuid: TEST_UUID,
        ai_provider: "openai",
        encrypted_api_key: encryptedApiKey.ciphertext,
        api_key_iv: encryptedApiKey.iv,
        languages: ["en"],
        nuvio_credentials: encryptedNuvio.ciphertext,
        nuvio_credentials_iv: encryptedNuvio.iv,
        fine_tuning_params: "Prefer action",
        country_filter: ["US"],
        genre_exclusions: ["horror"],
        genre_preferences: ["sci-fi"],
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
      };

      fetchMock.mockImplementation(async (url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("supabase.co") && urlStr.includes("user_configurations")) {
          return new Response(JSON.stringify([mockConfig]), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const request = new Request(
        `https://muxvyr.com/${TEST_UUID}/configure`,
        { method: "GET" }
      );

      const response = await handleGetConfigure(request, mockEnv, { uuid: TEST_UUID });

      // The response should be HTML (configuration page)
      expect(response.status).toBe(200);
      const responseText = await response.text();

      // The raw API key should NOT appear in the HTML response
      expect(responseText).not.toContain("sk-real-secret-key-ABCDEF1234");

      // The masked version should show only last 4 chars: "1234"
      expect(responseText).toContain("1234");
    });
  });

  describe("Update Configuration", () => {
    it("updates config and triggers cache invalidation", async () => {
      const encryptedApiKey = await encryptValue("sk-old-key-xxxx");
      const encryptedNuvio = await encryptValue(JSON.stringify({ email: "user@test.com", password: "oldpass" }));

      const existingConfig = {
        uuid: TEST_UUID,
        ai_provider: "openai",
        encrypted_api_key: encryptedApiKey.ciphertext,
        api_key_iv: encryptedApiKey.iv,
        languages: ["en"],
        nuvio_credentials: encryptedNuvio.ciphertext,
        nuvio_credentials_iv: encryptedNuvio.iv,
        fine_tuning_params: null,
        country_filter: null,
        genre_exclusions: null,
        genre_preferences: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      let patchCalled = false;
      const redisCalls: string[][] = [];

      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        // Supabase GET (check existing config)
        if (urlStr.includes("supabase.co") && urlStr.includes("user_configurations") && init?.method === "GET") {
          return new Response(JSON.stringify([existingConfig]), { status: 200 });
        }

        // Supabase PATCH (update)
        if (urlStr.includes("supabase.co") && init?.method === "PATCH") {
          patchCalled = true;
          return new Response(JSON.stringify([{ ...existingConfig, ai_provider: "gemini" }]), { status: 200 });
        }

        // Redis (cache invalidation)
        if (urlStr.includes("test-redis.upstash.io") && init?.method === "POST") {
          const body = JSON.parse(init.body as string);
          redisCalls.push(body);
          if (body[0] === "SCAN") {
            return new Response(JSON.stringify({ result: ["0", []] }), { status: 200 });
          }
          return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const updateBody = {
        ai_provider: "gemini",
        api_key: "AIzaSy-new-key-for-gemini",
        languages: ["en", "fr"],
        nuvio_credentials: "nuvio-new-token",
      };

      const request = new Request(`https://muxvyr.com/${TEST_UUID}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });

      const response = await handlePostConfigure(request, mockEnv, { uuid: TEST_UUID });
      const body = await response.json() as { message: string; uuid: string };

      expect(response.status).toBe(200);
      expect(body.message).toContain("updated successfully");
      expect(patchCalled).toBe(true);

      // Verify cache invalidation was attempted (SCAN call)
      const scanCalls = redisCalls.filter((call) => call[0] === "SCAN");
      expect(scanCalls.length).toBeGreaterThanOrEqual(1);
      expect(scanCalls[0][3]).toBe(`catalog:${TEST_UUID}:*`);
    });

    it("returns 404 when updating non-existent UUID", async () => {
      fetchMock.mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

        if (urlStr.includes("supabase.co") && init?.method === "GET") {
          return new Response(JSON.stringify([]), { status: 200 });
        }

        return new Response("", { status: 404 });
      });

      const request = new Request(`https://muxvyr.com/${TEST_UUID}/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_provider: "openai",
          api_key: "sk-test",
          languages: ["en"],
          nuvio_credentials: "token",
        }),
      });

      const response = await handlePostConfigure(request, mockEnv, { uuid: TEST_UUID });

      expect(response.status).toBe(404);
    });
  });
});
