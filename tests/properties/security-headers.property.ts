/**
 * Property-based tests for security headers.
 *
 * Feature: stremio-ai-recommendations, Property 12: Security headers present on all responses
 *
 * Validates: Requirements 16.5, 16.9
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  applySecurityHeaders,
  isAllowedOrigin,
  ALLOWED_ORIGINS,
} from "../../src/middleware/security";

/**
 * Arbitrary that generates random request paths (valid routes, invalid routes, random strings).
 */
const requestPathArb = fc.oneof(
  // Valid routes
  fc.constantFrom(
    "/",
    "/manifest.json",
    "/configure",
    "/catalog/movie/ai-recommendations.json",
    "/catalog/series/ai-recommendations.json"
  ),
  // UUID-based routes
  fc
    .uuid()
    .map((uuid) => `/${uuid}/manifest.json`),
  fc
    .uuid()
    .map((uuid) => `/${uuid}/configure`),
  fc
    .uuid()
    .map((uuid) => `/${uuid}/catalog/movie/ai-recommendations.json`),
  // Invalid/random routes
  fc
    .stringOf(
      fc.constantFrom(
        ..."abcdefghijklmnopqrstuvwxyz0123456789/-_.~".split("")
      ),
      { minLength: 1, maxLength: 100 }
    )
    .map((s) => `/${s}`),
  // Completely random strings
  fc.string({ minLength: 1, maxLength: 50 })
);

/**
 * Arbitrary that generates random HTTP methods.
 */
const httpMethodArb = fc.constantFrom(
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS"
);

/**
 * Arbitrary that generates allowed origins.
 */
const allowedOriginArb = fc.oneof(
  fc.constantFrom(...ALLOWED_ORIGINS),
  // Subdomains of muxvyr.com
  fc
    .stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-".split("")),
      { minLength: 1, maxLength: 20 }
    )
    .filter((s) => /^[\w-]+$/.test(s))
    .map((sub) => `https://${sub}.muxvyr.com`)
);

/**
 * Arbitrary that generates unknown/disallowed origins.
 */
const disallowedOriginArb = fc.oneof(
  fc.constantFrom(
    "https://evil.com",
    "https://attacker.org",
    "http://muxvyr.com",
    "https://muxvyr.com.evil.com",
    "https://notmuxvyr.com",
    "http://localhost:3000",
    "https://phishing-site.io"
  ),
  // Random https origins
  fc
    .stringOf(
      fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
      { minLength: 3, maxLength: 20 }
    )
    .filter((s) => !s.includes("muxvyr") && !s.includes("strem"))
    .map((domain) => `https://${domain}.com`)
);

/**
 * Arbitrary that generates any origin header value (allowed, disallowed, or empty).
 */
const originArb = fc.oneof(
  allowedOriginArb,
  disallowedOriginArb,
  fc.constant("")
);

/**
 * Helper to create a Request with given method, path, and origin.
 */
function createRequest(
  method: string,
  path: string,
  origin: string
): Request {
  const url = `https://muxvyr.com${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers();
  if (origin) {
    headers.set("Origin", origin);
  }
  return new Request(url, { method, headers });
}

/**
 * Helper to create a basic Response to apply headers to.
 * Handles null-body status codes (204, 304) which cannot have a body.
 */
function createResponse(status = 200): Response {
  const nullBodyStatuses = [101, 204, 205, 304];
  if (nullBodyStatuses.includes(status)) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Feature: stremio-ai-recommendations, Property 12: Security headers present on all responses", () => {
  it("Content-Security-Policy header is present on all responses", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        originArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          const csp = secured.headers.get("Content-Security-Policy");
          expect(csp).not.toBeNull();
          expect(csp!.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("X-Content-Type-Options is 'nosniff' on all responses", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        originArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          expect(secured.headers.get("X-Content-Type-Options")).toBe("nosniff");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("X-Frame-Options is 'DENY' on all responses", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        originArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          expect(secured.headers.get("X-Frame-Options")).toBe("DENY");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Strict-Transport-Security is present with max-age on all responses", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        originArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          const hsts = secured.headers.get("Strict-Transport-Security");
          expect(hsts).not.toBeNull();
          expect(hsts).toContain("max-age=");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Access-Control-Allow-Origin is ONLY set when origin is in the allowlist", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        disallowedOriginArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          // Disallowed origins should NOT have Access-Control-Allow-Origin set
          expect(secured.headers.get("Access-Control-Allow-Origin")).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Access-Control-Allow-Origin is set to the request origin when origin is allowed", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        allowedOriginArb,
        (path, method, origin) => {
          const request = createRequest(method, path, origin);
          const response = createResponse();
          const secured = applySecurityHeaders(response, request);

          // Allowed origins should have Access-Control-Allow-Origin set to that origin
          expect(secured.headers.get("Access-Control-Allow-Origin")).toBe(
            origin
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it("Access-Control-Allow-Origin is NOT set when no origin header is present", () => {
    fc.assert(
      fc.property(requestPathArb, httpMethodArb, (path, method) => {
        const request = createRequest(method, path, "");
        const response = createResponse();
        const secured = applySecurityHeaders(response, request);

        // No origin means no CORS header should be set
        expect(secured.headers.get("Access-Control-Allow-Origin")).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("security headers are present regardless of response status code", () => {
    fc.assert(
      fc.property(
        requestPathArb,
        httpMethodArb,
        originArb,
        fc.constantFrom(200, 201, 204, 301, 400, 401, 403, 404, 422, 429, 500, 502, 503),
        (path, method, origin, status) => {
          const request = createRequest(method, path, origin);
          const response = createResponse(status);
          const secured = applySecurityHeaders(response, request);

          expect(
            secured.headers.get("Content-Security-Policy")
          ).not.toBeNull();
          expect(secured.headers.get("X-Content-Type-Options")).toBe("nosniff");
          expect(secured.headers.get("X-Frame-Options")).toBe("DENY");
          expect(
            secured.headers.get("Strict-Transport-Security")
          ).not.toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
