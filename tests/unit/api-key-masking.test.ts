import { describe, it, expect } from "vitest";
import { maskApiKey } from "../../src/services/api-key-masking";

describe("maskApiKey", () => {
  describe("empty string", () => {
    it("returns empty string for empty input", () => {
      expect(maskApiKey("")).toBe("");
    });
  });

  describe("keys shorter than 4 characters (fully masked)", () => {
    it("masks a single character key", () => {
      expect(maskApiKey("a")).toBe("*");
    });

    it("masks a 2-character key", () => {
      expect(maskApiKey("ab")).toBe("**");
    });

    it("masks a 3-character key", () => {
      expect(maskApiKey("abc")).toBe("***");
    });
  });

  describe("keys of length >= 4 (last 4 chars visible)", () => {
    it("shows all 4 characters for a 4-character key", () => {
      expect(maskApiKey("abcd")).toBe("abcd");
    });

    it("masks first character and shows last 4 for a 5-character key", () => {
      expect(maskApiKey("abcde")).toBe("*bcde");
    });

    it("masks first 2 characters and shows last 4 for a 6-character key", () => {
      expect(maskApiKey("abcdef")).toBe("**cdef");
    });

    it("masks a realistic API key showing only last 4", () => {
      const key = "sk-proj-12345678";
      const masked = maskApiKey(key);
      expect(masked).toBe("************5678");
      expect(masked.length).toBe(key.length);
    });

    it("preserves the last 4 characters exactly", () => {
      const key = "mySecretApiKey123";
      const masked = maskApiKey(key);
      expect(masked.slice(-4)).toBe("y123");
      expect(masked.slice(-4)).toBe(key.slice(-4));
    });

    it("replaces all preceding characters with asterisks", () => {
      const key = "testkey12345";
      const masked = maskApiKey(key);
      const maskedPortion = masked.slice(0, -4);
      expect(maskedPortion).toBe("*".repeat(key.length - 4));
    });
  });

  describe("output length preservation", () => {
    it("output length equals input length for all non-empty keys", () => {
      const keys = ["x", "ab", "abc", "abcd", "abcde", "a-very-long-api-key-string"];
      for (const key of keys) {
        expect(maskApiKey(key).length).toBe(key.length);
      }
    });
  });
});
