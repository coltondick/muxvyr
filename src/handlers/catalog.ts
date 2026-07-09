/**
 * Catalog Handler
 *
 * @module handlers/catalog
 */

import type { Context } from "hono";
import { validateInput } from "../services/input-validator.js";
import { getConfiguration } from "../services/configuration.js";
import { decrypt, importKey } from "../services/encryption.js";
import { fetchWatchHistory } from "../services/nuvio-sync.js";
import { generateRecommendations } from "../services/ai-engine.js";
import { resolveMetadata } from "../services/metadata-resolver.js";
import type { StremioMetaPreview } from "../services/metadata-resolver.js";
import { getCatalog, setCatalog } from "../services/cache.js";
import { formatCatalogResponse } from "../services/catalog-formatter.js";
import { getEncryptionKey } from "../lib/config.js";

/**
 * GET /{uuid}/catalog/{type}/{id}.json
 */
export async function handleCatalog(c: Context): Promise<Response> {
  const uuid = c.req.param("uuid") ?? "";
  const type = c.req.param("type") ?? "";
  const id = c.req.param("id") ?? "";

  const validation = validateInput(uuid, { expectUUID: true });
  if (!validation.valid) {
    return c.json({ error: "Invalid configuration ID format" }, 400);
  }

  if (type !== "movie" && type !== "series") {
    return c.json({ error: "Invalid catalog type" }, 400);
  }

  const catalogId = id;

  // Check cache first
  try {
    const cached = await getCatalog(uuid, catalogId);
    if (cached !== null) {
      const catalogData = formatCatalogResponse(cached);
      return new Response(JSON.stringify(catalogData), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600",
        },
      });
    }
  } catch {
    // Cache read failed, continue
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

  let apiKey: string;
  let nuvioCredentials: string;
  try {
    const cryptoKey = importKey(getEncryptionKey());
    apiKey = decrypt(config.encrypted_api_key, config.api_key_iv, cryptoKey);
    nuvioCredentials = decrypt(config.nuvio_credentials, config.nuvio_credentials_iv, cryptoKey);
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }

  let watchHistory;
  try {
    watchHistory = await fetchWatchHistory(nuvioCredentials, uuid);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to sync watch history: ${reason}` }, 502);
  }

  const isByw = catalogId.startsWith("byw-");
  const catalogType = isByw ? "because-you-watched" : "general";
  let referenceTitleForByw: string | undefined;

  if (isByw) {
    const bywIdentifier = catalogId.replace(`byw-${type}-`, "");
    const matchedItem = watchHistory.find(
      (item) => item.imdb_id === bywIdentifier || sanitizeTitle(item.title) === bywIdentifier
    );
    referenceTitleForByw = matchedItem?.title;
  }

  const recommendations = await generateRecommendations({
    provider: config.ai_provider,
    apiKey,
    watchHistory,
    languages: config.languages,
    fineTuningParams: config.fine_tuning_params,
    countryFilter: config.country_filter,
    genreExclusions: config.genre_exclusions,
    genrePreferences: config.genre_preferences,
    catalogType,
    referenceTitleForByw,
    contentType: type as "movie" | "series",
  });

  apiKey = "";

  if (recommendations === null) {
    const emptyCatalog = formatCatalogResponse([]);
    return c.json(emptyCatalog);
  }

  const filteredRecommendations = recommendations.filter((rec) => rec.type === type);

  let excludeIds = new Set<string>();
  if (isByw) {
    try {
      const generalCatalog = await getCatalog(uuid, `ai-recommendations-${type}`);
      if (generalCatalog) {
        excludeIds = new Set(generalCatalog.map((m) => m.id));
      }
    } catch { /* non-fatal */ }
  }

  const resolvedMetas: StremioMetaPreview[] = [];
  for (const rec of filteredRecommendations) {
    try {
      const meta = await resolveMetadata(rec);
      if (meta !== null && !excludeIds.has(meta.id)) {
        resolvedMetas.push(meta);
      }
    } catch {
      continue;
    }
  }

  try {
    await setCatalog(uuid, catalogId, resolvedMetas);
  } catch { /* non-fatal */ }

  const catalogResponse = formatCatalogResponse(resolvedMetas);
  return new Response(JSON.stringify(catalogResponse), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600",
    },
  });
}

function sanitizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
