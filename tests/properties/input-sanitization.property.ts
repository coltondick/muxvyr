/**
 * Property-based tests for input sanitization.
 *
 * Feature: stremio-ai-recommendations, Property 11: Input sanitization rejects malicious input
 *
 * Validates: Requirements 16.6
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  isValidUUID,
  containsSQLInjection,
  containsXSS,
  containsNullBytes,
  validateInput,
} from "../../src/services/input-validator";

/**
 * Arbitrary that generates strings containing SQL injection patterns.
 */
const sqlInjectionArb = fc.oneof(
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} DROP TABLE ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} UNION SELECT ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} SELECT * FROM ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} OR 1=1 ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} AND 1=1 ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} INSERT INTO ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} DELETE FROM ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} UPDATE users SET ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}; DROP ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} EXEC(${suffix})`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix} EXECUTE ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}' OR '${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}-- ${suffix}`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}/* ${suffix} */`
  )
);

/**
 * Arbitrary that generates strings containing XSS patterns.
 */
const xssArb = fc.oneof(
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}<script>${suffix}</script>`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}<script src="${suffix}">`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}</script>${suffix}`
  ),
  fc.tuple(fc.string(), fc.webFragments()).map(
    ([prefix, handler]) => `${prefix}<img onerror="${handler}">`
  ),
  fc.tuple(fc.string(), fc.webFragments()).map(
    ([prefix, handler]) => `${prefix}<div onclick="${handler}">`
  ),
  fc.tuple(fc.string(), fc.webFragments()).map(
    ([prefix, handler]) => `${prefix}<body onload="${handler}">`
  ),
  fc.tuple(fc.string(), fc.string()).map(
    ([prefix, suffix]) => `${prefix}javascript:${suffix}`
  )
);

/**
 * Arbitrary that generates strings with embedded null bytes.
 */
const nullByteArb = fc.tuple(fc.string(), fc.string()).map(
  ([prefix, suffix]) => `${prefix}\0${suffix}`
);

/**
 * Arbitrary that generates invalid UUID formats.
 * These strings look UUID-ish but are invalid for various reasons.
 */
const invalidUUIDArb = fc.oneof(
  // Wrong length (too short)
  fc.hexaString({ minLength: 1, maxLength: 31 }),
  // Wrong length (too long)
  fc.hexaString({ minLength: 37, maxLength: 50 }),
  // Correct structure but wrong version (not 4)
  fc.tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.constantFrom("1", "2", "3", "5", "6", "7"),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.constantFrom("8", "9", "a", "b"),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.hexaString({ minLength: 12, maxLength: 12 })
  ).map(([g1, g2, ver, g3rest, variant, g4rest, g5]) =>
    `${g1}-${g2}-${ver}${g3rest}-${variant}${g4rest}-${g5}`
  ),
  // Correct structure but wrong variant (not 8, 9, a, b)
  fc.tuple(
    fc.hexaString({ minLength: 8, maxLength: 8 }),
    fc.hexaString({ minLength: 4, maxLength: 4 }),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.constantFrom("c", "d", "e", "f", "0", "1", "2", "3", "4", "5", "6", "7"),
    fc.hexaString({ minLength: 3, maxLength: 3 }),
    fc.hexaString({ minLength: 12, maxLength: 12 })
  ).map(([g1, g2, g3rest, variant, g4rest, g5]) =>
    `${g1}-${g2}-4${g3rest}-${variant}${g4rest}-${g5}`
  ),
  // Contains non-hex characters
  fc.tuple(
    fc.string({ minLength: 8, maxLength: 8 }),
    fc.string({ minLength: 4, maxLength: 4 }),
    fc.string({ minLength: 4, maxLength: 4 }),
    fc.string({ minLength: 4, maxLength: 4 }),
    fc.string({ minLength: 12, maxLength: 12 })
  ).map(([g1, g2, g3, g4, g5]) => `${g1}-${g2}-${g3}-${g4}-${g5}`)
    .filter((s) => /[^0-9a-f-]/i.test(s)), // ensure it actually has non-hex chars
  // No dashes
  fc.hexaString({ minLength: 32, maxLength: 32 }),
  // Random short strings
  fc.string({ minLength: 1, maxLength: 10 })
);

/**
 * Arbitrary that generates valid, clean strings that should pass validation.
 * These are alphanumeric with common safe characters.
 */
const cleanStringArb = fc.stringOf(
  fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_:()".split("")
  ),
  { minLength: 1, maxLength: 100 }
);

describe("Feature: stremio-ai-recommendations, Property 11: Input sanitization rejects malicious input", () => {
  it("rejects all inputs containing SQL injection patterns", () => {
    fc.assert(
      fc.property(sqlInjectionArb, (maliciousInput) => {
        // Filter out inputs that accidentally contain null bytes (tested separately)
        if (containsNullBytes(maliciousInput)) return true;

        const result = validateInput(maliciousInput);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Input contains SQL injection pattern");
      }),
      { numRuns: 100 }
    );
  });

  it("rejects all inputs containing XSS patterns", () => {
    fc.assert(
      fc.property(xssArb, (maliciousInput) => {
        // Filter out inputs that accidentally contain null bytes or SQL injection
        if (containsNullBytes(maliciousInput)) return true;
        if (containsSQLInjection(maliciousInput)) return true;

        const result = validateInput(maliciousInput);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Input contains XSS pattern");
      }),
      { numRuns: 100 }
    );
  });

  it("rejects all inputs containing null bytes", () => {
    fc.assert(
      fc.property(nullByteArb, (maliciousInput) => {
        const result = validateInput(maliciousInput);
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Input contains null bytes");
      }),
      { numRuns: 100 }
    );
  });

  it("rejects invalid UUID formats when UUID validation is expected", () => {
    fc.assert(
      fc.property(invalidUUIDArb, (invalidUUID) => {
        // Filter out inputs that trigger earlier validation checks
        if (containsNullBytes(invalidUUID)) return true;
        if (containsSQLInjection(invalidUUID)) return true;
        if (containsXSS(invalidUUID)) return true;
        // Skip if it accidentally generates a valid UUID
        if (isValidUUID(invalidUUID)) return true;

        const result = validateInput(invalidUUID, { expectUUID: true });
        expect(result.valid).toBe(false);
        expect(result.reason).toBe("Input is not a valid UUID v4 format");
      }),
      { numRuns: 100 }
    );
  });

  it("accepts clean, safe strings that contain no malicious patterns", () => {
    fc.assert(
      fc.property(cleanStringArb, (safeInput) => {
        // Only test strings that genuinely don't match any patterns
        if (containsNullBytes(safeInput)) return true;
        if (containsSQLInjection(safeInput)) return true;
        if (containsXSS(safeInput)) return true;

        const result = validateInput(safeInput);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it("SQL injection detection catches patterns regardless of surrounding content", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.constantFrom(
          "DROP TABLE",
          "UNION SELECT",
          "SELECT *",
          "OR 1=1",
          "AND 1=1",
          "INSERT INTO",
          "DELETE FROM"
        ),
        fc.string({ minLength: 0, maxLength: 50 }),
        (prefix, pattern, suffix) => {
          const input = `${prefix} ${pattern} ${suffix}`;
          if (containsNullBytes(input)) return true;

          expect(containsSQLInjection(input)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("XSS detection catches patterns regardless of surrounding content", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.constantFrom(
          "<script>",
          "</script>",
          '<script src="x">',
          "javascript:",
          '<img onerror="x">',
          '<div onclick="x">'
        ),
        fc.string({ minLength: 0, maxLength: 50 }),
        (prefix, pattern, suffix) => {
          const input = `${prefix}${pattern}${suffix}`;
          if (containsNullBytes(input)) return true;

          expect(containsXSS(input)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
