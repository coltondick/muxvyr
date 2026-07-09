/**
 * Recommendation History Service
 *
 * Tracks previously recommended titles and dismissed titles to avoid repeats.
 *
 * @module recommendation-history
 */

import { query } from "../lib/db.js";
import type { StremioMetaPreview } from "./metadata-resolver.js";

/**
 * Returns recent recommended content_ids for a user.
 */
export async function getRecommendationHistory(
  uuid: string,
  limit: number = 50
): Promise<string[]> {
  try {
    const result = await query<{ content_id: string }>(
      `SELECT content_id FROM recommendation_history
       WHERE user_uuid = $1
       ORDER BY recommended_at DESC
       LIMIT $2`,
      [uuid, limit]
    );
    return result.rows.map((r) => r.content_id);
  } catch {
    return [];
  }
}

/**
 * Returns recent recommended titles for prompt inclusion.
 */
export async function getRecommendationHistoryTitles(
  uuid: string,
  limit: number = 50
): Promise<string[]> {
  try {
    const result = await query<{ title: string }>(
      `SELECT title FROM recommendation_history
       WHERE user_uuid = $1
       ORDER BY recommended_at DESC
       LIMIT $2`,
      [uuid, limit]
    );
    return result.rows.map((r) => r.title);
  } catch {
    return [];
  }
}

/**
 * Bulk inserts recommended items into history.
 */
export async function saveRecommendationHistory(
  uuid: string,
  items: StremioMetaPreview[],
  catalogType: string
): Promise<void> {
  if (items.length === 0) return;

  try {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;

    for (const item of items) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
      values.push(uuid, item.id, item.name, item.type, catalogType);
      idx += 5;
    }

    await query(
      `INSERT INTO recommendation_history (user_uuid, content_id, title, content_type, catalog_type)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (user_uuid, content_id) DO UPDATE SET recommended_at = NOW()`,
      values
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Returns dismissed content_ids for a user.
 */
export async function getDismissedTitles(uuid: string): Promise<string[]> {
  try {
    const result = await query<{ content_id: string }>(
      `SELECT content_id FROM dismissed_titles WHERE user_uuid = $1`,
      [uuid]
    );
    return result.rows.map((r) => r.content_id);
  } catch {
    return [];
  }
}

/**
 * Inserts a dismissed title.
 */
export async function dismissTitle(
  uuid: string,
  contentId: string,
  title: string
): Promise<void> {
  await query(
    `INSERT INTO dismissed_titles (user_uuid, content_id, title)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_uuid, content_id) DO NOTHING`,
    [uuid, contentId, title]
  );
}
