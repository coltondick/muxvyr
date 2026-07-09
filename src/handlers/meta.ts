/**
 * Meta Resource Handler
 *
 * Provides Stremio-compatible meta responses by proxying Cinemeta.
 *
 * @module handlers/meta
 */

import type { Context } from "hono";

/**
 * GET /:uuid/meta/:type/:id.json — fetch full metadata from Cinemeta.
 */
export async function handleMeta(c: Context): Promise<Response> {
  const type = c.req.param("type") ?? "";
  const id = (c.req.param("id") ?? "").replace(".json", "");

  if (type !== "movie" && type !== "series") {
    return c.json({ error: "Invalid type" }, 400);
  }

  if (!id || !id.startsWith("tt")) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  try {
    const response = await fetch(
      `https://v3-cinemeta.strem.io/meta/${type}/${id}.json`
    );

    if (!response.ok) {
      return c.json({ meta: null }, 404);
    }

    const data = (await response.json()) as { meta?: unknown };

    return new Response(JSON.stringify({ meta: data.meta || null }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
      },
    });
  } catch {
    return c.json({ meta: null }, 500);
  }
}
