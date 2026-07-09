/**
 * Health Check Handler
 *
 * @module handlers/health
 */

import type { Context } from "hono";
import { query } from "../lib/db.js";
import { redis } from "../lib/redis.js";

const startTime = Date.now();

/**
 * GET /health — checks Postgres and Redis connectivity.
 */
export async function handleHealth(c: Context): Promise<Response> {
  let dbOk = false;
  let redisOk = false;

  try {
    await query("SELECT 1");
    dbOk = true;
  } catch {
    // db unreachable
  }

  try {
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch {
    // redis unreachable
  }

  const status = dbOk && redisOk ? "healthy" : "degraded";
  const statusCode = dbOk && redisOk ? 200 : 503;

  return c.json(
    {
      status,
      db: dbOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: process.env.npm_package_version || "2.0.0",
    },
    statusCode
  );
}
