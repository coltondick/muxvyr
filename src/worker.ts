/**
 * Stremio AI Recommendations — BullMQ Worker
 *
 * Processes catalog generation jobs in the background.
 * Also runs a cron schedule to regenerate all catalogs every 6 hours.
 */

import "dotenv/config";
import { Worker } from "bullmq";
import cron from "node-cron";
import { pregenerateCatalogs, regenerateAllCatalogs } from "./services/catalog-pregenerate.js";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

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

// ─── BullMQ Worker ─────────────────────────────────────────────────────────────

const worker = new Worker(
  "catalog-generation",
  async (job) => {
    const { uuid } = job.data as { uuid: string };
    console.log(`[worker] Processing catalog generation for ${uuid}`);
    await pregenerateCatalogs(uuid);
    console.log(`[worker] Completed catalog generation for ${uuid}`);
  },
  {
    connection,
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 60_000,
    },
  }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err.message);
});

// ─── Cron: Regenerate all catalogs every 6 hours ───────────────────────────────

cron.schedule("0 */6 * * *", async () => {
  console.log("[cron] Starting scheduled catalog regeneration for all users");
  try {
    await regenerateAllCatalogs();
    console.log("[cron] Completed scheduled catalog regeneration");
  } catch (error) {
    console.error("[cron] Regeneration failed:", error);
  }
});

console.log("🔧 BullMQ worker started. Listening for catalog-generation jobs...");
console.log("⏰ Cron scheduled: regenerate all catalogs every 6 hours");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[worker] Shutting down...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[worker] Shutting down...");
  await worker.close();
  process.exit(0);
});
