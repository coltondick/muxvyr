/**
 * Configuration Page Handler
 *
 * Handles configuration CRUD operations using Hono context.
 *
 * @module handlers/configure
 */

import type { Context } from "hono";
import { validateInput } from "../services/input-validator.js";
import {
  getConfiguration,
  createConfiguration,
  updateConfiguration,
} from "../services/configuration.js";
import { decrypt, importKey } from "../services/encryption.js";
import { maskApiKey } from "../services/api-key-masking.js";
import { validateConfiguration } from "../services/config-validator.js";
import { invalidateUser } from "../services/cache.js";
import { buildManifestUrl } from "../services/manifest-builder.js";
import { nuvioLogin } from "../services/nuvio-sync.js";
import { getConfigureHtml } from "../frontend/configure.js";
import { getLandingHtml } from "../frontend/landing.js";
import { enqueueCatalogGeneration } from "../lib/queue.js";
import { getEncryptionKey } from "../lib/config.js";
import { redis } from "../lib/redis.js";

/**
 * GET /{uuid}/configure — existing user's config page.
 */
export async function handleGetConfigure(c: Context): Promise<Response> {
  const uuid = c.req.param("uuid") ?? "";

  const validation = validateInput(uuid, { expectUUID: true });
  if (!validation.valid) {
    return c.json({ error: "Invalid configuration ID format" }, 400);
  }

  let config;
  try {
    config = await getConfiguration(uuid);
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }

  if (config === null) {
    return c.json({ error: "Configuration not found" }, 404);
  }

  let maskedApiKey: string;
  try {
    const cryptoKey = importKey(getEncryptionKey());
    const decryptedApiKey = decrypt(config.encrypted_api_key, config.api_key_iv, cryptoKey);
    maskedApiKey = maskApiKey(decryptedApiKey);
  } catch {
    maskedApiKey = "****";
  }

  let nuvioProfileId = 1;
  let nuvioProfiles: Array<{ profile_index: number; name: string }> = [];
  try {
    const cryptoKey = importKey(getEncryptionKey());
    const decryptedNuvio = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);
    const parsedNuvio = JSON.parse(decryptedNuvio) as { email?: string; password?: string; profile_id?: number };
    nuvioProfileId = parsedNuvio.profile_id ?? 1;

    try {
      let accessToken: string | null = null;
      const sessionStr = await redis.get(`nuvio:session:${uuid}`);
      if (sessionStr) {
        const session = JSON.parse(sessionStr) as { access_token: string };
        accessToken = session.access_token;
      }
      if (!accessToken && parsedNuvio.email && parsedNuvio.password) {
        const session = await nuvioLogin(parsedNuvio.email, parsedNuvio.password);
        accessToken = session.access_token;
      }
      if (accessToken) {
        const profilesRes = await fetch("https://api.nuvio.tv/rest/v1/rpc/sync_pull_profiles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN",
          },
        });
        if (profilesRes.ok) {
          const profileData = (await profilesRes.json()) as Array<{ profile_index: number; name: string }>;
          nuvioProfiles = profileData.map((p) => ({
            profile_index: p.profile_index,
            name: p.name || `Profile ${p.profile_index}`,
          }));
        }
      }
    } catch {
      // Non-fatal
    }
  } catch {
    // Default to profile 1
  }

  const configData = {
    uuid: config.uuid,
    ai_provider: config.ai_provider,
    masked_api_key: maskedApiKey,
    languages: config.languages,
    has_nuvio_credentials: true,
    nuvio_profile_id: nuvioProfileId,
    nuvio_profiles: nuvioProfiles,
    fine_tuning_params: config.fine_tuning_params || null,
    country_filter: config.country_filter || [],
    genre_exclusions: config.genre_exclusions || [],
    genre_preferences: config.genre_preferences || [],
  };

  const html = getConfigureHtml(configData, uuid);
  return c.html(html);
}

/**
 * GET /configure — new configuration page.
 */
export async function handleGetNewConfigure(c: Context): Promise<Response> {
  const html = getConfigureHtml(null, "");
  return c.html(html);
}

/**
 * GET / — landing page.
 */
export async function handleLandingPage(c: Context): Promise<Response> {
  const html = getLandingHtml();
  return c.html(html);
}

/**
 * POST /{uuid}/configure — update existing configuration.
 */
export async function handlePostConfigure(c: Context): Promise<Response> {
  const uuid = c.req.param("uuid") ?? "";

  const uuidValidation = validateInput(uuid, { expectUUID: true });
  if (!uuidValidation.valid) {
    return c.json({ error: "Invalid configuration ID format" }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const input = body as Record<string, unknown>;
  if (input.ai_provider && !["gemini", "openai", "grok"].includes(input.ai_provider as string)) {
    return c.json(
      { error: "Validation failed", fields: [{ field: "ai_provider", message: "Must be gemini, openai, or grok" }] },
      422
    );
  }
  if (input.languages && (!Array.isArray(input.languages) || input.languages.length === 0)) {
    return c.json(
      { error: "Validation failed", fields: [{ field: "languages", message: "At least one language is required" }] },
      422
    );
  }

  let existingConfig;
  try {
    existingConfig = await getConfiguration(uuid);
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }

  if (existingConfig === null) {
    return c.json({ error: "Configuration not found" }, 404);
  }

  const updatePayload: Record<string, unknown> = {};
  if (input.ai_provider) updatePayload.ai_provider = input.ai_provider;
  if (input.api_key) updatePayload.api_key = input.api_key;
  if (input.languages) updatePayload.languages = input.languages;
  if (input.nuvio_credentials) {
    try {
      const nuvioCreds = JSON.parse(input.nuvio_credentials as string);
      if (nuvioCreds.email && nuvioCreds.password) {
        updatePayload.nuvio_credentials = input.nuvio_credentials;
      }
    } catch {
      // Invalid JSON, skip nuvio update
    }
  }
  if (input.fine_tuning_params !== undefined) updatePayload.fine_tuning_params = input.fine_tuning_params;
  if (input.country_filter !== undefined) updatePayload.country_filter = input.country_filter;
  if (input.genre_exclusions !== undefined) updatePayload.genre_exclusions = input.genre_exclusions;
  if (input.genre_preferences !== undefined) updatePayload.genre_preferences = input.genre_preferences;

  try {
    const updated = await updateConfiguration(uuid, updatePayload as Partial<import("../services/configuration.js").CreateConfigInput>);
    if (!updated) {
      return c.json({ error: "Configuration not found" }, 404);
    }
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }

  try { await invalidateUser(uuid); } catch { /* non-fatal */ }

  // Enqueue background catalog generation
  try { await enqueueCatalogGeneration(uuid); } catch { /* non-fatal */ }

  return c.json({ message: "Configuration updated successfully", uuid });
}

/**
 * POST /configure — create new configuration.
 */
export async function handleCreateConfigure(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const configValidation = validateConfiguration(body);
  if (!configValidation.valid) {
    return c.json({ error: "Validation failed", fields: configValidation.errors }, 422);
  }

  const input = body as Record<string, unknown>;
  let uuid: string;
  try {
    uuid = await createConfiguration({
      ai_provider: input.ai_provider as "gemini" | "openai" | "grok",
      api_key: input.api_key as string,
      languages: input.languages as string[],
      nuvio_credentials: input.nuvio_credentials as string,
      fine_tuning_params: input.fine_tuning_params as string | undefined,
      country_filter: input.country_filter as string[] | undefined,
      genre_exclusions: input.genre_exclusions as string[] | undefined,
      genre_preferences: input.genre_preferences as string[] | undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[createConfiguration] Error:", message);
    return c.json({ error: "Failed to create configuration", detail: message }, 500);
  }

  // Enqueue background catalog generation
  try { await enqueueCatalogGeneration(uuid); } catch { /* non-fatal */ }

  const manifestUrl = buildManifestUrl(uuid);
  return c.json({ message: "Configuration created successfully", uuid, manifest_url: manifestUrl }, 201);
}

/**
 * POST /api/verify-nuvio — verify Nuvio credentials.
 */
export async function handleVerifyNuvio(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const email = input.email as string | undefined;
  const password = input.password as string | undefined;

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  try {
    const session = await nuvioLogin(email, password);

    let profiles: Array<{ profile_index: number; name: string }> = [];
    try {
      const profilesRes = await fetch("https://api.nuvio.tv/rest/v1/rpc/sync_pull_profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN",
        },
      });
      if (profilesRes.ok) {
        const profileData = (await profilesRes.json()) as Array<{ profile_index: number; name: string }>;
        profiles = profileData.map((p) => ({
          profile_index: p.profile_index,
          name: p.name || `Profile ${p.profile_index}`,
        }));
      }
    } catch {
      // Non-fatal
    }

    return c.json({ verified: true, message: "Nuvio account verified successfully", profiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    return c.json({ verified: false, message }, 401);
  }
}
