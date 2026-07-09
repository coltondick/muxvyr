/**
 * Property-based tests for router handler behavior.
 *
 * Feature: stremio-ai-recommendations
 * - Property 10: Non-existent UUID returns 404
 *
 * Validates: Requirements 2.3, 14.3
 */
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { handleManifest } from "../../src/handlers/manifest";
import { handleGetConfigure } from "../../src/handlers/configure";
import type { WorkerEnv } from "../../src/index";

/**
 * Mock WorkerEnv for testing.
 */
const mockEnv: WorkerEnv = {
  SUPABASE_URL: "https://mock.supabase.co",
  SUPABASE_SERVICE_KEY: "mock-service-key",
  UPSTASH_REDIS_URL: "https://mock.upstash.io",
  UPSTASH_REDIS_TOKEN: "mock-redis-token",
  ENCRYPTION_KEY: "a".repeat(64),
};

/**
 * Mock getConfiguration to always return null (non-existent UUID).
 */
vi.mock("../../src/services/configuration", () => ({
  getConfiguration: vi.fn().mockResolvedValue(null),
  createConfiguration: vi.fn(),
  updateConfiguration: vi.fn(),
}));

describe("Feature: stremio-ai-recommendations, Property 10: Non-existent UUID returns 404", () => {
  it("manifest endpoint returns 404 for non-existent UUIDs (100 iterations)", () => {
    /**
     * Validates: Requirements 2.3, 14.3
     *
     * For any UUID that does not correspond to a stored configuration,
     * requests to the manifest endpoint SHALL return an HTTP 404 status code.
     */
    fc.assert(
      fc.asyncProperty(fc.uuid(), async (uuid) => {
        const request = new Request(`https://muxvyr.com/${uuid}/manifest.json`, {
          method: "GET",
        });

        const response = await handleManifest(request, mockEnv, { uuid });

        expect(response.status).toBe(404);

        const body = (await response.json()) as { error: string };
        expect(body.error).toBe("Configuration not found");
      }),
      { numRuns: 100 }
    );
  });

  it("configure endpoint returns 404 for non-existent UUIDs (100 iterations)", () => {
    /**
     * Validates: Requirements 2.3, 14.3
     *
     * For any UUID that does not correspond to a stored configuration,
     * requests to the configure endpoint SHALL return an HTTP 404 status code.
     */
    fc.assert(
      fc.asyncProperty(fc.uuid(), async (uuid) => {
        const request = new Request(`https://muxvyr.com/${uuid}/configure`, {
          method: "GET",
        });

        const response = await handleGetConfigure(request, mockEnv, { uuid });

        expect(response.status).toBe(404);

        const body = (await response.json()) as { error: string };
        expect(body.error).toBe("Configuration not found");
      }),
      { numRuns: 100 }
    );
  });
});
