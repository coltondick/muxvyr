/**
 * Input Validation Module
 *
 * Provides validation and sanitization utilities for all user-supplied input.
 * Targets Cloudflare Workers runtime (no Node.js built-ins).
 *
 * @module input-validator
 * @requirements 16.6
 */

/**
 * Strict RFC 4122 v4 UUID regex pattern.
 * Requires version 4 (4 in the third group) and correct variant bits (8, 9, a, or b).
 */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * SQL injection patterns to detect.
 * Matches common attack vectors case-insensitively.
 */
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /\bDROP\s+TABLE\b/i,
  /\bSELECT\s+\*/i,
  /\bUNION\s+SELECT\b/i,
  /\bOR\s+1\s*=\s*1\b/i,
  /\bAND\s+1\s*=\s*1\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bUPDATE\s+\w+\s+SET\b/i,
  /\bEXEC(\s+|\()/i,
  /\bEXECUTE\s/i,
  /;\s*DROP\b/i,
  /'\s*OR\s*'/i,
  /--\s/,
  /\/\*[\s\S]*?\*\//,
];

/**
 * XSS patterns to detect.
 * Matches script tags, event handlers, and javascript: protocol.
 */
const XSS_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /<\/script>/i,
  /\bon\w+\s*=/i,
  /javascript\s*:/i,
];

/**
 * Validates whether a string is a valid RFC 4122 v4 UUID.
 *
 * @param input - The string to validate
 * @returns true if the input is a valid v4 UUID
 */
export function isValidUUID(input: string): boolean {
  return UUID_V4_REGEX.test(input);
}

/**
 * Detects SQL injection patterns in a string.
 *
 * @param input - The string to check
 * @returns true if SQL injection patterns are detected
 */
export function containsSQLInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Detects XSS/script injection patterns in a string.
 *
 * @param input - The string to check
 * @returns true if XSS patterns are detected
 */
export function containsXSS(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Checks for null byte characters in a string.
 *
 * @param input - The string to check
 * @returns true if null bytes are found
 */
export function containsNullBytes(input: string): boolean {
  return input.includes("\0");
}

/**
 * Sanitizes a string by removing null bytes and trimming whitespace.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeString(input: string): string {
  return input.replace(/\0/g, "").trim();
}

/**
 * Options for the validateInput function.
 */
export interface ValidateInputOptions {
  /** Whether the input is expected to be a UUID */
  expectUUID?: boolean;
}

/**
 * Validation result returned by validateInput.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Combines all validation checks into a single function.
 * Checks for null bytes, SQL injection, XSS, and optionally UUID format.
 *
 * @param input - The string to validate
 * @param options - Optional validation configuration
 * @returns A validation result with valid flag and optional reason for rejection
 */
export function validateInput(
  input: string,
  options?: ValidateInputOptions
): ValidationResult {
  if (containsNullBytes(input)) {
    return { valid: false, reason: "Input contains null bytes" };
  }

  if (containsSQLInjection(input)) {
    return { valid: false, reason: "Input contains SQL injection pattern" };
  }

  if (containsXSS(input)) {
    return { valid: false, reason: "Input contains XSS pattern" };
  }

  if (options?.expectUUID && !isValidUUID(input)) {
    return { valid: false, reason: "Input is not a valid UUID v4 format" };
  }

  return { valid: true };
}
