/**
 * Trending Catalog Handler
 *
 * Provides AI-generated trending recommendations without per-user auth.
 * Uses a hardcoded set of popular recent titles as seed data.
 *
 * @module handlers/trending
 */

import type { Context } from "hono";
import { redis } from "../lib/redis.js";
import { generateRecommendations } from "../services/ai-engine.js";
import { resolveMetadata } from "../services/metadata-resolver.js";
import type { StremioMetaPreview } from "../services/metadata-resolver.js";
import { formatCatalogResponse } from "../services/catalog-formatter.js";

/** Cache TTL for trending catalogs: 24 hours */
const TRENDING_TTL_SECONDS = 86400;

/** Hardcoded popular recent titles used as seed for trending recommendations */
const TRENDING_SEED_HISTORY = [
  { title: "The Bear", type: "series" as const, watched_at: new Date().toISOString() },
  { title: "Oppenheimer", type: "movie" as const, watched_at: new Date().toISOString() },
  { title: "Fallout", type: "series" as const, watched_at: new Date().toISOString() },
  { title: "Dune: Part Two", type: "movie" as const, watched_at: new Date().toISOString() },
  { title: "Shogun", type: "series" as const, watched_at: new Date().toISOString() },
  { title: "Poor Things", type: "movie" as const, watched_at: new Date().toISOString() },
  { title: "Baby Reindeer", type: "series" as const, watched_at: new Date().toISOString() },
  { title: "The Holdovers", type: "movie" as const, watched_at: new Date().toISOString() },
  { title: "Ripley", type: "series" as const, watched_at: new Date().toISOString() },
  { title: "Killers of the Flower Moon", type: "movie" as const, watched_at: new Date().toISOString() },
];

/**
 * Returns the global (non-user-specific) manifest with trending catalogs.
 */
export async function handleGlobalManifest(c: Context): Promise<Response> {
  const manifest = {
    id: "com.muxvyr.ai-recommendations",
    version: "1.0.0",
    name: "AI Recommendations",
    description: "AI-powered content recommendations — trending and personalized",
    resources: ["catalog"],
    types: ["movie", "series"],
    catalogs: [
      { type: "movie", id: "trending-ai", name: "Trending AI Picks" },
      { type: "series", id: "trending-ai", name: "Trending AI Picks" },
    ],
    idPrefixes: ["tt"],
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
    },
  });
}

/**
 * GET /catalog/:type/trending-ai.json
 */
export async function handleTrendingCatalog(c: Context): Promise<Response> {
  const type = c.req.param("type") ?? "";

  if (type !== "movie" && type !== "series") {
    return c.json({ error: "Invalid catalog type" }, 400);
  }

  const cacheKey = `trending:${type}`;

  // Check cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const items = JSON.parse(cached) as StremioMetaPreview[];
      return new Response(JSON.stringify(formatCatalogResponse(items)), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600",
        },
      });
    }
  } catch {
    // Cache miss, continue
  }

  // Need an AI provider config from env for trending
  const provider = (process.env.TRENDING_AI_PROVIDER || "gemini") as "gemini" | "openai" | "grok";
  const apiKey = process.env.TRENDING_AI_API_KEY || "";

  if (!apiKey) {
    // No API key configured for trending — return empty
    return c.json(formatCatalogResponse([]));
  }

  try {
    const recommendations = await generateRecommendations({
      provider,
      apiKey,
      watchHistory: TRENDING_SEED_HISTORY,
      languages: ["English"],
      catalogType: "general",
      contentType: type,
    });

    if (!recommendations) {
      return c.json(formatCatalogResponse([]));
    }

    const filtered = recommendations.filter((r) => r.type === type);
    const resolved: StremioMetaPreview[] = [];

    for (const rec of filtered) {
      try {
        const meta = await resolveMetadata(rec);
        if (meta) resolved.push(meta);
      } catch {
        continue;
      }
    }

    // Cache for 24 hours
    try {
      await redis.setex(cacheKey, TRENDING_TTL_SECONDS, JSON.stringify(resolved));
    } catch {
      // Non-fatal
    }

    return new Response(JSON.stringify(formatCatalogResponse(resolved)), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=21600, stale-while-revalidate=3600",
      },
    });
  } catch {
    return c.json(formatCatalogResponse([]));
  }
}
