/**
 * API Key Masking Service
 *
 * Masks API keys for safe display, showing only the last 4 characters.
 * For keys shorter than 4 characters, the entire key is masked.
 */

/**
 * Masks an API key by replacing all characters except the last 4 with asterisks.
 * For keys shorter than 4 characters, masks the entire key.
 * For empty strings, returns an empty string.
 *
 * @param key - The API key to mask
 * @returns The masked API key string
 */
export function maskApiKey(key: string): string {
  if (key.length === 0) {
    return "";
  }

  if (key.length < 4) {
    return "*".repeat(key.length);
  }

  const maskedLength = key.length - 4;
  const visiblePart = key.slice(-4);
  return "*".repeat(maskedLength) + visiblePart;
}
