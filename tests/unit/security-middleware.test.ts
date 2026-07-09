/**
 * Unit tests for security middleware.
 *
 * @requirements 16.5, 16.9
 */
import { describe, it, expect } from "vitest";
import {
  ALLOWED_ORIGINS,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
  applySecurityHeaders,
} from "../../src/middleware/security";

describe("security-middleware", () => {
  describe("isAllowedOrigin", () => {
    it("allows https://muxvyr.com", () => {
      expect(isAllowedOrigin("https://muxvyr.com")).toBe(true);
    });

    it("allows https://app.strem.io", () => {
      expect(isAllowedOrigin("https://app.strem.io")).toBe(true);
    });

    it("allows https://web.stremio.com", () => {
      expect(isAllowedOrigin("https://web.stremio.com")).toBe(true);
    });

    it("allows subdomains of muxvyr.com", () => {
      expect(isAllowedOrigin("https://www.muxvyr.com")).toBe(true);
      expect(isAllowedOrigin("https://api.muxvyr.com")).toBe(true);
    });

    it("rejects unknown origins", () => {
      expect(isAllowedOrigin("https://evil.com")).toBe(false);
      expect(isAllowedOrigin("https://muxvyr.com.evil.com")).toBe(false);
      expect(isAllowedOrigin("http://muxvyr.com")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isAllowedOrigin("")).toBe(false);
    });
  });

  describe("applySecurityHeaders", () => {
    function makeRequest(origin?: string): Request {
      const headers = new Headers();
      if (origin) {
        headers.set("Origin", origin);
      }
      return new Request("https://muxvyr.com/test", { headers });
    }

    function makeResponse(
      body = "OK",
      init?: ResponseInit
    ): Response {
      return new Response(body, init);
    }

    it("adds Content-Security-Policy header", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest()
      );
      expect(response.headers.get("Content-Security-Policy")).toBeTruthy();
    });

    it("adds X-Content-Type-Options: nosniff header", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest()
      );
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("adds X-Frame-Options: DENY header", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest()
      );
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("adds Strict-Transport-Security header", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest()
      );
      const hsts = response.headers.get("Strict-Transport-Security");
      expect(hsts).toContain("max-age=");
      expect(hsts).toContain("includeSubDomains");
    });

    it("sets Access-Control-Allow-Origin for allowed origin", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest("https://muxvyr.com")
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://muxvyr.com"
      );
    });

    it("sets Access-Control-Allow-Origin for Stremio client origin", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest("https://app.strem.io")
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://app.strem.io"
      );
    });

    it("does not set Access-Control-Allow-Origin for unknown origin", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest("https://evil.com")
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("does not set Access-Control-Allow-Origin when no Origin header", () => {
      const response = applySecurityHeaders(
        makeResponse(),
        makeRequest()
      );
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("preserves existing Content-Type header", () => {
      const original = makeResponse("body", {
        headers: { "Content-Type": "application/json" },
      });
      const response = applySecurityHeaders(original, makeRequest());
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("preserves response status and body", async () => {
      const original = makeResponse("hello", { status: 201 });
      const response = applySecurityHeaders(original, makeRequest());
      expect(response.status).toBe(201);
      expect(await response.text()).toBe("hello");
    });
  });

  describe("handleCorsPreflightIfNeeded", () => {
    function makeOptions(origin?: string): Request {
      const headers = new Headers();
      if (origin) {
        headers.set("Origin", origin);
      }
      return new Request("https://muxvyr.com/test", {
        method: "OPTIONS",
        headers,
      });
    }

    it("returns null for non-OPTIONS requests", () => {
      const request = new Request("https://muxvyr.com/test", {
        method: "GET",
      });
      expect(handleCorsPreflightIfNeeded(request)).toBeNull();
    });

    it("returns null for POST requests", () => {
      const request = new Request("https://muxvyr.com/test", {
        method: "POST",
      });
      expect(handleCorsPreflightIfNeeded(request)).toBeNull();
    });

    it("returns 204 response for OPTIONS with allowed origin", () => {
      const response = handleCorsPreflightIfNeeded(
        makeOptions("https://muxvyr.com")
      );
      expect(response).not.toBeNull();
      expect(response!.status).toBe(204);
      expect(response!.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://muxvyr.com"
      );
      expect(response!.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
      expect(response!.headers.get("Access-Control-Allow-Headers")).toContain(
        "Content-Type"
      );
    });

    it("returns 204 without CORS headers for OPTIONS with unknown origin", () => {
      const response = handleCorsPreflightIfNeeded(
        makeOptions("https://evil.com")
      );
      expect(response).not.toBeNull();
      expect(response!.status).toBe(204);
      expect(response!.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("returns 204 without CORS headers when no Origin header", () => {
      const response = handleCorsPreflightIfNeeded(makeOptions());
      expect(response).not.toBeNull();
      expect(response!.status).toBe(204);
      expect(response!.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });

    it("sets Access-Control-Max-Age header for allowed origin", () => {
      const response = handleCorsPreflightIfNeeded(
        makeOptions("https://web.stremio.com")
      );
      expect(response!.headers.get("Access-Control-Max-Age")).toBe("86400");
    });
  });
});
