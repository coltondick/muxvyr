/**
 * Configuration Service
 *
 * Handles CRUD operations for user configurations stored in PostgreSQL.
 * Encrypts sensitive fields (API key, Nuvio credentials) before storage.
 *
 * @module configuration
 */

import { encrypt, importKey } from "./encryption.js";
import { query } from "../lib/db.js";
import { getEncryptionKey } from "../lib/config.js";

/**
 * Stored user configuration as persisted in PostgreSQL.
 */
export interface UserConfiguration {
  uuid: string;
  ai_provider: "gemini" | "openai" | "grok";
  encrypted_api_key: string;
  api_key_iv: string;
  languages: string[];
  nuvio_credentials: string;
  nuvio_credentials_iv: string;
  fine_tuning_params?: string;
  country_filter?: string[];
  genre_exclusions?: string[];
  genre_preferences?: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Input type for creating a new configuration.
 */
export interface CreateConfigInput {
  ai_provider: "gemini" | "openai" | "grok";
  api_key: string;
  languages: string[];
  nuvio_credentials: string;
  fine_tuning_params?: string;
  country_filter?: string[];
  genre_exclusions?: string[];
  genre_preferences?: string[];
}

/**
 * Creates a new user configuration.
 */
export async function createConfiguration(
  input: CreateConfigInput
): Promise<string> {
  const key = importKey(getEncryptionKey());

  const encryptedApiKey = encrypt(input.api_key, key);
  const encryptedNuvio = encrypt(input.nuvio_credentials, key);

  const result = await query<{ uuid: string }>(
    `INSERT INTO user_configurations
      (ai_provider, encrypted_api_key, api_key_iv, languages, nuvio_credentials, nuvio_credentials_iv, fine_tuning_params, country_filter, genre_exclusions, genre_preferences)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING uuid`,
    [
      input.ai_provider,
      encryptedApiKey.ciphertext,
      encryptedApiKey.iv,
      input.languages,
      encryptedNuvio.ciphertext,
      encryptedNuvio.iv,
      input.fine_tuning_params || null,
      input.country_filter || null,
      input.genre_exclusions || null,
      input.genre_preferences || null,
    ]
  );

  return result.rows[0].uuid;
}

/**
 * Retrieves a user configuration by UUID.
 */
export async function getConfiguration(
  uuid: string
): Promise<UserConfiguration | null> {
  const result = await query<UserConfiguration>(
    `SELECT * FROM user_configurations WHERE uuid = $1`,
    [uuid]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/**
 * Updates an existing user configuration.
 */
export async function updateConfiguration(
  uuid: string,
  input: Partial<CreateConfigInput>
): Promise<boolean> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.api_key !== undefined) {
    const key = importKey(getEncryptionKey());
    const encrypted = encrypt(input.api_key, key);
    setClauses.push(`encrypted_api_key = $${paramIndex++}`);
    values.push(encrypted.ciphertext);
    setClauses.push(`api_key_iv = $${paramIndex++}`);
    values.push(encrypted.iv);
  }

  if (input.nuvio_credentials !== undefined) {
    const key = importKey(getEncryptionKey());
    const encrypted = encrypt(input.nuvio_credentials, key);
    setClauses.push(`nuvio_credentials = $${paramIndex++}`);
    values.push(encrypted.ciphertext);
    setClauses.push(`nuvio_credentials_iv = $${paramIndex++}`);
    values.push(encrypted.iv);
  }

  if (input.ai_provider !== undefined) {
    setClauses.push(`ai_provider = $${paramIndex++}`);
    values.push(input.ai_provider);
  }
  if (input.languages !== undefined) {
    setClauses.push(`languages = $${paramIndex++}`);
    values.push(input.languages);
  }
  if (input.fine_tuning_params !== undefined) {
    setClauses.push(`fine_tuning_params = $${paramIndex++}`);
    values.push(input.fine_tuning_params);
  }
  if (input.country_filter !== undefined) {
    setClauses.push(`country_filter = $${paramIndex++}`);
    values.push(input.country_filter);
  }
  if (input.genre_exclusions !== undefined) {
    setClauses.push(`genre_exclusions = $${paramIndex++}`);
    values.push(input.genre_exclusions);
  }
  if (input.genre_preferences !== undefined) {
    setClauses.push(`genre_preferences = $${paramIndex++}`);
    values.push(input.genre_preferences);
  }

  if (setClauses.length === 0) return true;

  values.push(uuid);
  const result = await query(
    `UPDATE user_configurations SET ${setClauses.join(", ")} WHERE uuid = $${paramIndex}`,
    values
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Deletes a user configuration by UUID.
 */
export async function deleteConfiguration(uuid: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM user_configurations WHERE uuid = $1`,
    [uuid]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Lists all user configurations (for admin).
 */
export async function listConfigurations(): Promise<UserConfiguration[]> {
  const result = await query<UserConfiguration>(
    `SELECT * FROM user_configurations ORDER BY updated_at DESC`
  );
  return result.rows;
}
