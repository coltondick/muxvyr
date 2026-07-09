/**
 * Security middleware for the Stremio AI Recommendations Add-on.
 *
 * Provides Hono middleware for security headers and CORS validation.
 *
 * @module middleware/security
 */

import type { Context, Next } from "hono";

/**
 * Allowed CORS origins: muxvyr.com (and subdomains), Stremio client origins.
 */
export const ALLOWED_ORIGINS: string[] = [
  "https://muxvyr.com",
  "https://app.strem.io",
  "https://web.stremio.com",
];

/**
 * Checks whether a given origin is in the allowlist.
 */
export function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }
  if (/^https:\/\/[\w-]+\.muxvyr\.com$/.test(origin)) {
    return true;
  }
  return false;
}

/**
 * Hono middleware that applies security headers and CORS to all responses.
 */
export async function securityMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Handle CORS preflight
  if (c.req.method === "OPTIONS") {
    const origin = c.req.header("Origin") ?? "";
    const headers: Record<string, string> = {};
    if (isAllowedOrigin(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Admin-Password";
      headers["Access-Control-Max-Age"] = "86400";
    }
    return new Response(null, { status: 204, headers });
  }

  await next();

  // Apply security headers to response
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; connect-src 'self' https://api.nuvio.tv"
  );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  // CORS
  const origin = c.req.header("Origin") ?? "";
  if (isAllowedOrigin(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
  }
}
