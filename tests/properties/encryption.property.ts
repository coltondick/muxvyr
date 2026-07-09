/**
 * Property-based tests for encryption round-trip.
 *
 * Feature: stremio-ai-recommendations, Property 3: API key encryption round-trip
 *
 * Validates: Requirements 3.4, 13.1
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { importKey, encrypt, decrypt } from "../../src/services/encryption";

// A fixed 256-bit test key (64 hex characters)
const TEST_HEX_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * Checks if a string contains lone (unpaired) UTF-16 surrogates.
 * Lone surrogates cannot round-trip through TextEncoder/TextDecoder.
 */
function hasLoneSurrogates(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: must be followed by a low surrogate
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++; // skip the low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Low surrogate without preceding high surrogate
      return true;
    }
  }
  return false;
}

/**
 * Arbitrary that generates random strings of varying lengths (0 to 500 chars),
 * including ASCII, unicode, special characters, and emoji.
 * Uses fc.fullUnicode to generate well-formed unicode strings (no lone surrogates).
 */
const randomStringArb = fc.oneof(
  // Full unicode strings (including astral plane characters / emoji)
  fc.fullUnicode({ minLength: 0, maxLength: 500 }),
  // Pure ASCII strings
  fc.string({ minLength: 0, maxLength: 500 }),
  // Unicode strings (BMP only, well-formed)
  fc.unicode({ minLength: 0, maxLength: 500 }).filter(
    (s) => !hasLoneSurrogates(s)
  )
);

/**
 * Arbitrary that generates strings simulating API keys:
 * alphanumeric + typical special chars used in API keys.
 */
const apiKeyArb = fc.stringOf(
  fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:+/=".split(
      ""
    )
  ),
  { minLength: 1, maxLength: 200 }
);

/**
 * Arbitrary that generates strings with special characters and unicode.
 */
const specialCharsArb = fc.stringOf(
  fc.constantFrom(
    ..."!@#$%^&*()[]{}|;:',.<>?/~`±§£€¥¢₹₿∞≈≠≤≥".split("")
  ),
  { minLength: 1, maxLength: 100 }
);

/**
 * Arbitrary that generates emoji strings.
 * Uses full emoji strings constructed from complete code points.
 */
const emojiArb = fc.array(
  fc.constantFrom(
    "🎉", "🌍", "🚀", "💡", "🔑", "🔒", "✅", "❌", "🎯", "📦",
    "🧪", "🔥", "💎", "🦄", "🌈", "⚡", "🎭", "🎨", "🏆", "🎵"
  ),
  { minLength: 1, maxLength: 50 }
).map((arr) => arr.join(""));

describe("Feature: stremio-ai-recommendations, Property 3: API key encryption round-trip", () => {
  it("encrypt then decrypt produces original plaintext for random unicode strings (100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(randomStringArb, async (plaintext) => {
        const { ciphertext, iv } = await encrypt(plaintext, key);
        const decrypted = await decrypt(ciphertext, iv, key);
        return decrypted === plaintext;
      }),
      { numRuns: 100 }
    );
  });

  it("encrypt then decrypt produces original plaintext for API key strings (100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(apiKeyArb, async (plaintext) => {
        const { ciphertext, iv } = await encrypt(plaintext, key);
        const decrypted = await decrypt(ciphertext, iv, key);
        return decrypted === plaintext;
      }),
      { numRuns: 100 }
    );
  });

  it("encrypt then decrypt produces original plaintext for special characters (100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(specialCharsArb, async (plaintext) => {
        const { ciphertext, iv } = await encrypt(plaintext, key);
        const decrypted = await decrypt(ciphertext, iv, key);
        return decrypted === plaintext;
      }),
      { numRuns: 100 }
    );
  });

  it("encrypt then decrypt produces original plaintext for emoji strings (100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(emojiArb, async (plaintext) => {
        const { ciphertext, iv } = await encrypt(plaintext, key);
        const decrypted = await decrypt(ciphertext, iv, key);
        return decrypted === plaintext;
      }),
      { numRuns: 100 }
    );
  });

  it("ciphertext always differs from plaintext (100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        async (plaintext) => {
          const { ciphertext } = await encrypt(plaintext, key);
          // The base64-encoded ciphertext must differ from the plaintext
          return ciphertext !== plaintext;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("two encryptions of the same plaintext produce different ciphertexts (unique IV, 100 iterations)", async () => {
    const key = await importKey(TEST_HEX_KEY);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 500 }),
        async (plaintext) => {
          const result1 = await encrypt(plaintext, key);
          const result2 = await encrypt(plaintext, key);

          // Different IVs mean different ciphertexts
          return result1.iv !== result2.iv && result1.ciphertext !== result2.ciphertext;
        }
      ),
      { numRuns: 100 }
    );
  });
});
