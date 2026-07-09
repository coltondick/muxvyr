/**
 * Unit tests for the Worker Router.
 *
 * Tests route matching, 404 handling, and landing/configure page serving.
 * Routes that call external services (Supabase, Redis) are tested in
 * integration tests, not here.
 *
 * @requirements 14.1, 16.6
 */
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("Worker Router", () => {
  describe("GET /", () => {
    it("returns landing page HTML response", async () => {
      const response = await SELF.fetch("http://localhost/");
      expect(response.status).toBe(200);
      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("text/html");
      const body = await response.text();
      expect(body).toContain("AI Recommendations");
    });
  });

  describe("GET /configure", () => {
    it("returns the new configuration page", async () => {
      const response = await SELF.fetch("http://localhost/configure");
      expect(response.status).toBe(200);
      const contentType = response.headers.get("Content-Type");
      expect(contentType).toContain("text/html");
      const body = await response.text();
      expect(body).toContain("AI Provider");
    });
  });

  describe("route matching", () => {
    it("rejects invalid catalog types with 404", async () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const response = await SELF.fetch(
        `http://localhost/${uuid}/catalog/anime/ai-recommendations.json`
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent paths", async () => {
      const response = await SELF.fetch("http://localhost/nonexistent");
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Not found");
    });

    it("returns 404 for invalid UUID format in path", async () => {
      const response = await SELF.fetch(
        "http://localhost/not-a-uuid/manifest.json"
      );
      expect(response.status).toBe(404);
    });

    it("returns 404 for wrong HTTP method", async () => {
      const response = await SELF.fetch("http://localhost/", {
        method: "POST",
      });
      expect(response.status).toBe(404);
    });

    it("returns 404 JSON with Content-Type header", async () => {
      const response = await SELF.fetch("http://localhost/nonexistent");
      expect(response.headers.get("Content-Type")).toContain("application/json");
    });

    it("includes security headers on 404 responses", async () => {
      const response = await SELF.fetch("http://localhost/nonexistent");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });
  });

  describe("CORS preflight", () => {
    it("handles OPTIONS requests with 204", async () => {
      const response = await SELF.fetch("http://localhost/", {
        method: "OPTIONS",
        headers: { Origin: "https://muxvyr.com" },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://muxvyr.com"
      );
    });

    it("rejects OPTIONS from unknown origins", async () => {
      const response = await SELF.fetch("http://localhost/", {
        method: "OPTIONS",
        headers: { Origin: "https://evil.com" },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
