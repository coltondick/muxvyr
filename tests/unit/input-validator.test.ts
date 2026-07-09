/**
 * Unit tests for the input validation module.
 *
 * @requirements 16.6
 */
import { describe, it, expect } from "vitest";
import {
  isValidUUID,
  containsSQLInjection,
  containsXSS,
  containsNullBytes,
  sanitizeString,
  validateInput,
} from "../../src/services/input-validator";

describe("input-validator", () => {
  describe("isValidUUID", () => {
    it("accepts a valid v4 UUID (lowercase)", () => {
      expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });

    it("accepts a valid v4 UUID (uppercase)", () => {
      expect(isValidUUID("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
    });

    it("accepts a valid v4 UUID (mixed case)", () => {
      expect(isValidUUID("550e8400-E29B-41d4-a716-446655440000")).toBe(true);
    });

    it("rejects a UUID with wrong version (not 4)", () => {
      // Version 1 UUID (third group starts with 1)
      expect(isValidUUID("550e8400-e29b-11d4-a716-446655440000")).toBe(false);
    });

    it("rejects a UUID with wrong variant bits", () => {
      // Variant bits must be 8, 9, a, or b — using 'c' here
      expect(isValidUUID("550e8400-e29b-41d4-c716-446655440000")).toBe(false);
    });

    it("rejects a UUID with wrong variant bits (0)", () => {
      expect(isValidUUID("550e8400-e29b-41d4-0716-446655440000")).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(isValidUUID("")).toBe(false);
    });

    it("rejects a string without dashes", () => {
      expect(isValidUUID("550e8400e29b41d4a716446655440000")).toBe(false);
    });

    it("rejects a UUID with extra characters", () => {
      expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000x")).toBe(false);
    });

    it("rejects a string with non-hex characters", () => {
      expect(isValidUUID("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
    });

    it("rejects a UUID with wrong group lengths", () => {
      expect(isValidUUID("550e840-e29b-41d4-a716-446655440000")).toBe(false);
    });
  });

  describe("containsSQLInjection", () => {
    it("detects DROP TABLE", () => {
      expect(containsSQLInjection("DROP TABLE users")).toBe(true);
    });

    it("detects DROP TABLE (case insensitive)", () => {
      expect(containsSQLInjection("drop table users")).toBe(true);
    });

    it("detects SELECT *", () => {
      expect(containsSQLInjection("SELECT * FROM users")).toBe(true);
    });

    it("detects UNION SELECT", () => {
      expect(containsSQLInjection("1 UNION SELECT password FROM users")).toBe(
        true
      );
    });

    it("detects OR 1=1", () => {
      expect(containsSQLInjection("' OR 1=1 --")).toBe(true);
    });

    it("detects AND 1=1", () => {
      expect(containsSQLInjection("' AND 1=1 --")).toBe(true);
    });

    it("detects INSERT INTO", () => {
      expect(containsSQLInjection("INSERT INTO users VALUES('admin')")).toBe(
        true
      );
    });

    it("detects DELETE FROM", () => {
      expect(containsSQLInjection("DELETE FROM users")).toBe(true);
    });

    it("detects UPDATE SET", () => {
      expect(
        containsSQLInjection("UPDATE users SET admin=true")
      ).toBe(true);
    });

    it("detects semicolon followed by DROP", () => {
      expect(containsSQLInjection("; DROP database")).toBe(true);
    });

    it("detects SQL comment syntax (--)", () => {
      expect(containsSQLInjection("admin'-- ")).toBe(true);
    });

    it("detects block comments", () => {
      expect(containsSQLInjection("admin/* comment */")).toBe(true);
    });

    it("does not flag normal text", () => {
      expect(containsSQLInjection("Hello, this is a normal message")).toBe(
        false
      );
    });

    it("does not flag text that includes SQL keywords in normal context", () => {
      expect(containsSQLInjection("Please select an option from the menu")).toBe(
        false
      );
    });
  });

  describe("containsXSS", () => {
    it("detects <script> tag", () => {
      expect(containsXSS("<script>alert('xss')</script>")).toBe(true);
    });

    it("detects <script> with attributes", () => {
      expect(containsXSS('<script src="evil.js">')).toBe(true);
    });

    it("detects closing </script> tag", () => {
      expect(containsXSS("</script>")).toBe(true);
    });

    it("detects onerror event handler", () => {
      expect(containsXSS('<img onerror="alert(1)">')).toBe(true);
    });

    it("detects onclick event handler", () => {
      expect(containsXSS('<div onclick="evil()">')).toBe(true);
    });

    it("detects onload event handler", () => {
      expect(containsXSS('<body onload="evil()">')).toBe(true);
    });

    it("detects javascript: protocol", () => {
      expect(containsXSS("javascript:alert(1)")).toBe(true);
    });

    it("detects javascript: protocol with spaces", () => {
      expect(containsXSS("javascript :alert(1)")).toBe(true);
    });

    it("does not flag normal HTML-like text", () => {
      expect(containsXSS("Use the <b>bold</b> tag")).toBe(false);
    });

    it("does not flag normal text", () => {
      expect(containsXSS("This is a safe string")).toBe(false);
    });
  });

  describe("containsNullBytes", () => {
    it("detects null byte in string", () => {
      expect(containsNullBytes("hello\0world")).toBe(true);
    });

    it("detects null byte at start", () => {
      expect(containsNullBytes("\0start")).toBe(true);
    });

    it("detects null byte at end", () => {
      expect(containsNullBytes("end\0")).toBe(true);
    });

    it("returns false for clean string", () => {
      expect(containsNullBytes("hello world")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(containsNullBytes("")).toBe(false);
    });
  });

  describe("sanitizeString", () => {
    it("removes null bytes", () => {
      expect(sanitizeString("hel\0lo")).toBe("hello");
    });

    it("removes multiple null bytes", () => {
      expect(sanitizeString("\0he\0ll\0o\0")).toBe("hello");
    });

    it("trims leading whitespace", () => {
      expect(sanitizeString("  hello")).toBe("hello");
    });

    it("trims trailing whitespace", () => {
      expect(sanitizeString("hello  ")).toBe("hello");
    });

    it("trims and removes null bytes together", () => {
      expect(sanitizeString("  he\0llo  ")).toBe("hello");
    });

    it("returns empty string for only null bytes and whitespace", () => {
      expect(sanitizeString(" \0 \0 ")).toBe("");
    });

    it("leaves clean strings unchanged", () => {
      expect(sanitizeString("hello")).toBe("hello");
    });
  });

  describe("validateInput", () => {
    it("accepts a normal string", () => {
      const result = validateInput("hello world");
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("rejects string with null bytes", () => {
      const result = validateInput("hello\0world");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains null bytes");
    });

    it("rejects SQL injection patterns", () => {
      const result = validateInput("DROP TABLE users");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains SQL injection pattern");
    });

    it("rejects XSS patterns", () => {
      const result = validateInput("<script>alert(1)</script>");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains XSS pattern");
    });

    it("validates UUID format when expectUUID is true", () => {
      const result = validateInput("not-a-uuid", { expectUUID: true });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input is not a valid UUID v4 format");
    });

    it("accepts valid UUID when expectUUID is true", () => {
      const result = validateInput("550e8400-e29b-41d4-a716-446655440000", {
        expectUUID: true,
      });
      expect(result.valid).toBe(true);
    });

    it("does not check UUID format when expectUUID is false", () => {
      const result = validateInput("not-a-uuid", { expectUUID: false });
      expect(result.valid).toBe(true);
    });

    it("does not check UUID format when options not provided", () => {
      const result = validateInput("not-a-uuid");
      expect(result.valid).toBe(true);
    });

    it("checks null bytes before SQL injection", () => {
      // String has both null bytes and SQL injection; null bytes should be caught first
      const result = validateInput("\0DROP TABLE users");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains null bytes");
    });

    it("checks SQL injection before XSS", () => {
      // String has both SQL injection and XSS; SQL should be caught first
      const result = validateInput("DROP TABLE users <script>");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains SQL injection pattern");
    });

    it("checks XSS before UUID validation", () => {
      // String has XSS and is not a valid UUID
      const result = validateInput("<script>alert(1)</script>", {
        expectUUID: true,
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("Input contains XSS pattern");
    });
  });
});
