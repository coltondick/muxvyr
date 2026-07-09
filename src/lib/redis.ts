/**
 * Redis Client
 *
 * Provides an ioredis instance for caching and a connection factory for BullMQ.
 *
 * @module lib/redis
 */

import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Shared Redis client for caching operations.
 */
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Creates a new Redis connection for BullMQ (it needs its own connection).
 */
export function createBullMQConnection(): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
