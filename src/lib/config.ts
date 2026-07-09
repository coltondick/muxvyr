/**
 * Application Configuration
 *
 * Reads environment variables and exposes typed config accessors.
 *
 * @module lib/config
 */

import "dotenv/config";

export function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  return key;
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD || "changeme";
}

export function getPort(): number {
  return parseInt(process.env.PORT || "3000", 10);
}
