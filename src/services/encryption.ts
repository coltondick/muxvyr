/**
 * Encryption Service
 *
 * Re-exports encryption functions from lib/encryption for backward compatibility.
 * All modules that previously imported from this file continue to work.
 *
 * @module services/encryption
 */

export { importKey, encrypt, decrypt } from "../lib/encryption.js";
