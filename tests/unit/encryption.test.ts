/**
 * Unit tests for the encryption service.
 *
 * @requirements 3.4, 13.1, 13.4
 */
import { describe, it, expect } from "vitest";
import {
  importKey,
  encrypt,
  decrypt,
  hexToArrayBuffer,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "../../src/services/encryption";

// A valid 256-bit hex key (64 hex characters)
const VALID_HEX_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// A different valid 256-bit hex key for wrong-key tests
const WRONG_HEX_KEY =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("encryption", () => {
  describe("importKey", () => {
    it("imports a valid 64-character hex key successfully", async () => {
      const key = await importKey(VALID_HEX_KEY);
      expect(key).toBeDefined();
      expect(key.type).toBe("secret");
      expect(key.algorithm).toMatchObject({ name: "AES-GCM" });
      expect(key.usages).toContain("encrypt");
      expect(key.usages).toContain("decrypt");
    });

    it("throws for a hex key that is too short", async () => {
      await expect(importKey("0123456789abcdef")).rejects.toThrow(
        "Invalid key length"
      );
    });

    it("throws for a hex key that is too long", async () => {
      const longKey = VALID_HEX_KEY + "aa";
      await expect(importKey(longKey)).rejects.toThrow("Invalid key length");
    });

    it("throws for an empty string", async () => {
      await expect(importKey("")).rejects.toThrow("Invalid key length");
    });

    it("throws for non-hex characters", async () => {
      // 64 chars but contains 'g' and 'z'
      const invalidHex =
        "0123456789abcdefg123456789abcdef0123456789abcdef012345678zabcde";
      await expect(importKey(invalidHex)).rejects.toThrow();
    });
  });

  describe("encrypt", () => {
    it("produces base64-encoded ciphertext and IV", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const result = await encrypt("hello world", key);

      expect(result.ciphertext).toBeDefined();
      expect(result.iv).toBeDefined();
      // Verify they are valid base64 by attempting to decode
      expect(() => atob(result.ciphertext)).not.toThrow();
      expect(() => atob(result.iv)).not.toThrow();
    });

    it("produces ciphertext that differs from the plaintext", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "hello world";
      const result = await encrypt(plaintext, key);

      // The base64-encoded ciphertext should not match the plaintext
      expect(result.ciphertext).not.toBe(plaintext);
      // Decode and check raw bytes differ too
      const ciphertextBytes = atob(result.ciphertext);
      expect(ciphertextBytes).not.toBe(plaintext);
    });

    it("generates different IVs each call (unique per operation)", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const result1 = await encrypt("same plaintext", key);
      const result2 = await encrypt("same plaintext", key);

      expect(result1.iv).not.toBe(result2.iv);
    });

    it("generates a 12-byte IV (16 base64 chars)", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const result = await encrypt("test", key);

      // 12 bytes → base64 = 16 characters
      const ivBytes = base64ToArrayBuffer(result.iv);
      expect(new Uint8Array(ivBytes).length).toBe(12);
    });

    it("encrypts an empty string", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const result = await encrypt("", key);

      expect(result.ciphertext).toBeDefined();
      expect(result.iv).toBeDefined();
    });
  });

  describe("decrypt", () => {
    it("recovers the original plaintext", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "hello world";
      const { ciphertext, iv } = await encrypt(plaintext, key);

      const decrypted = await decrypt(ciphertext, iv, key);
      expect(decrypted).toBe(plaintext);
    });

    it("recovers an empty string", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const { ciphertext, iv } = await encrypt("", key);

      const decrypted = await decrypt(ciphertext, iv, key);
      expect(decrypted).toBe("");
    });

    it("recovers plaintext with special characters", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "résumé • naïve — 日本語 🎉";
      const { ciphertext, iv } = await encrypt(plaintext, key);

      const decrypted = await decrypt(ciphertext, iv, key);
      expect(decrypted).toBe(plaintext);
    });

    it("fails with wrong key", async () => {
      const encryptKey = await importKey(VALID_HEX_KEY);
      const wrongKey = await importKey(WRONG_HEX_KEY);
      const { ciphertext, iv } = await encrypt("secret data", encryptKey);

      await expect(decrypt(ciphertext, iv, wrongKey)).rejects.toThrow();
    });

    it("fails with corrupted ciphertext", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const { ciphertext, iv } = await encrypt("test data", key);

      // Corrupt the ciphertext by replacing some characters
      const corrupted =
        "AAAA" + ciphertext.substring(4);

      await expect(decrypt(corrupted, iv, key)).rejects.toThrow();
    });

    it("fails with wrong IV", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const { ciphertext } = await encrypt("test data", key);

      // Use a different IV (encrypt another string to get a different IV)
      const { iv: wrongIv } = await encrypt("other data", key);

      await expect(decrypt(ciphertext, wrongIv, key)).rejects.toThrow();
    });
  });

  describe("round-trip: encrypt then decrypt", () => {
    it("returns original for simple ASCII", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "The quick brown fox jumps over the lazy dog";
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const result = await decrypt(ciphertext, iv, key);
      expect(result).toBe(plaintext);
    });

    it("returns original for unicode content", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "こんにちは世界 🌍🌎🌏";
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const result = await decrypt(ciphertext, iv, key);
      expect(result).toBe(plaintext);
    });

    it("returns original for long strings", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "a".repeat(10000);
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const result = await decrypt(ciphertext, iv, key);
      expect(result).toBe(plaintext);
    });

    it("returns original for JSON content (API key scenario)", async () => {
      const key = await importKey(VALID_HEX_KEY);
      const plaintext = "sk-proj-abc123XYZ789-def456GHI012";
      const { ciphertext, iv } = await encrypt(plaintext, key);
      const result = await decrypt(ciphertext, iv, key);
      expect(result).toBe(plaintext);
    });
  });

  describe("helper functions", () => {
    describe("hexToArrayBuffer", () => {
      it("converts valid hex to correct bytes", () => {
        const buffer = hexToArrayBuffer("48656c6c6f");
        const bytes = new Uint8Array(buffer);
        expect(bytes).toEqual(new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]));
      });

      it("handles empty string", () => {
        const buffer = hexToArrayBuffer("");
        expect(new Uint8Array(buffer).length).toBe(0);
      });

      it("throws for odd-length string", () => {
        expect(() => hexToArrayBuffer("abc")).toThrow("odd length");
      });

      it("throws for non-hex characters", () => {
        expect(() => hexToArrayBuffer("zzzz")).toThrow("non-hex characters");
      });
    });

    describe("base64 round-trip", () => {
      it("encodes and decodes correctly", () => {
        const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
        const encoded = arrayBufferToBase64(original.buffer);
        const decoded = new Uint8Array(base64ToArrayBuffer(encoded));
        expect(decoded).toEqual(original);
      });
    });
  });
});
