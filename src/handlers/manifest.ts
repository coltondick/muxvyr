/**
 * Manifest Handler
 *
 * @module handlers/manifest
 */

import type { Context } from "hono";
import { validateInput } from "../services/input-validator.js";
import { getConfiguration } from "../services/configuration.js";
import { decrypt, importKey } from "../services/encryption.js";
import { fetchWatchHistory } from "../services/nuvio-sync.js";
import { buildManifest } from "../services/manifest-builder.js";
import { getEncryptionKey } from "../lib/config.js";

/**
 * GET /{uuid}/manifest.json
 */
export async function handleManifest(c: Context): Promise<Response> {
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

  let watchHistory: import("../services/nuvio-sync.js").WatchHistoryItem[] = [];
  try {
    const cryptoKey = importKey(getEncryptionKey());
    const nuvioCredentials = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);
    watchHistory = await fetchWatchHistory(nuvioCredentials, uuid || undefined);
  } catch {
    watchHistory = [];
  }

  const manifest = buildManifest(uuid, watchHistory);

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
    },
  });
}
