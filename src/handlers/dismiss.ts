/**
 * Dismiss Handler
 *
 * Allows users to dismiss/dislike titles so they won't be recommended again.
 *
 * @module handlers/dismiss
 */

import type { Context } from "hono";
import { dismissTitle } from "../services/recommendation-history.js";

/**
 * POST /api/dismiss — dismiss a title for a user.
 * Body: { uuid, content_id, title }
 */
export async function handleDismiss(c: Context): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const uuid = input.uuid as string | undefined;
  const contentId = input.content_id as string | undefined;
  const title = input.title as string | undefined;

  if (!uuid || !contentId || !title) {
    return c.json({ error: "uuid, content_id, and title are required" }, 400);
  }

  try {
    await dismissTitle(uuid, contentId, title);
    return c.json({ success: true });
  } catch {
    return c.json({ error: "Failed to dismiss title" }, 500);
  }
}
