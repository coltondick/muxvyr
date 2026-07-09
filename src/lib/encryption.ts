/**
 * Encryption Service (Node.js)
 *
 * Provides AES-256-GCM encryption/decryption using Node.js crypto module.
 * Replaces the Web Crypto API implementation for self-hosted environments.
 *
 * @module lib/encryption
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Imports a hex-encoded 256-bit key as a Buffer for AES-GCM operations.
 *
 * @param hexKey - Hex-encoded 256-bit key (64 hex characters)
 * @returns Buffer containing the key bytes
 * @throws Error if the key is not exactly 256 bits (64 hex characters)
 */
export function importKey(hexKey: string): Buffer {
  if (hexKey.length !== 64) {
    throw new Error(
      "Invalid key length: expected 64 hex characters (256 bits)"
    );
  }
  if (!/^[0-9a-fA-F]*$/.test(hexKey)) {
    throw new Error("Invalid hex string: contains non-hex characters");
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM with a unique random IV.
 *
 * @param plaintext - The string to encrypt
 * @param key - Buffer containing the 256-bit key
 * @returns Object with base64-encoded ciphertext (includes auth tag) and IV
 */
export function encrypt(
  plaintext: string,
  key: Buffer
): { ciphertext: string; iv: string } {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine encrypted data + auth tag (matches Web Crypto API AES-GCM output format)
  const combined = Buffer.concat([encrypted, authTag]);

  return {
    ciphertext: combined.toString("base64"),
    iv: iv.toString("base64"),
  };
}

/**
 * Decrypts AES-256-GCM encrypted data.
 *
 * @param ciphertext - Base64-encoded ciphertext (includes auth tag at the end)
 * @param iv - Base64-encoded initialization vector
 * @param key - Buffer containing the 256-bit key
 * @returns The decrypted plaintext string
 * @throws Error if decryption fails (wrong key, corrupted data, etc.)
 */
export function decrypt(ciphertext: string, iv: string, key: Buffer): string {
  const combined = Buffer.from(ciphertext, "base64");
  const ivBuffer = Buffer.from(iv, "base64");

  // Split combined buffer into encrypted data and auth tag
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
