/**
 * BullMQ Queue
 *
 * Exports the catalog generation queue and a helper to enqueue jobs.
 *
 * @module lib/queue
 */

import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Parse the Redis URL into connection options for BullMQ
function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  };
}

const connection = parseRedisUrl(redisUrl);

export const catalogQueue = new Queue("catalog-generation", { connection });

/**
 * Enqueue a catalog generation job for a given user UUID.
 */
export async function enqueueCatalogGeneration(uuid: string): Promise<void> {
  await catalogQueue.add(
    "generate",
    { uuid },
    {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    }
  );
}
