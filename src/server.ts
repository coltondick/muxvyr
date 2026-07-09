/**
 * Stremio AI Recommendations — Hono HTTP Server
 *
 * Main entry point for the self-hosted Node.js application.
 */

import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { securityMiddleware } from "./middleware/security.js";
import { rateLimitMiddleware } from "./middleware/rate-limiter.js";
import { handleManifest } from "./handlers/manifest.js";
import { handleCatalog } from "./handlers/catalog.js";
import {
  handleGetConfigure,
  handlePostConfigure,
  handleCreateConfigure,
  handleGetNewConfigure,
  handleLandingPage,
  handleVerifyNuvio,
} from "./handlers/configure.js";
import {
  handleAdminPage,
  handleAdminListUsers,
  handleAdminGetRecommendations,
  handleAdminGetWatchHistory,
  handleAdminForceRefresh,
  handleAdminDeleteUser,
  handleAdminRegenerateAll,
  handleAdminQueueStatus,
  handleAdminUserLogs,
  handleAdminAllLogs,
  handleAdminPrewarm,
} from "./handlers/admin.js";
import { handleHealth } from "./handlers/health.js";
import { handleDismiss } from "./handlers/dismiss.js";
import { handleMeta } from "./handlers/meta.js";
import { handleTrendingCatalog, handleGlobalManifest } from "./handlers/trending.js";
import { getPort } from "./lib/config.js";

const app = new Hono();

// ─── Request Logging Middleware ────────────────────────────────────────────────

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  const log = {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    duration_ms: duration,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(log));
});

// Global middleware
app.use("*", securityMiddleware);
app.use("*", rateLimitMiddleware());

// ─── Routes ────────────────────────────────────────────────────────────────────

// Health check (no auth)
app.get("/health", handleHealth);

// Landing page
app.get("/", handleLandingPage);

// Global manifest (no UUID, includes trending catalogs)
app.get("/manifest.json", handleGlobalManifest);

// Trending catalogs (no auth required)
app.get("/catalog/:type/trending-ai.json", handleTrendingCatalog);

// Configuration pages
app.get("/configure", handleGetNewConfigure);
app.post("/configure", handleCreateConfigure);
app.get("/:uuid/configure", handleGetConfigure);
app.post("/:uuid/configure", handlePostConfigure);

// Nuvio verification
app.post("/api/verify-nuvio", handleVerifyNuvio);

// Dismiss/dislike mechanism
app.post("/api/dismiss", handleDismiss);

// Stremio manifest
app.get("/:uuid/manifest.json", handleManifest);

// Stremio catalog
app.get("/:uuid/catalog/:type/:id.json", handleCatalog);

// Stremio meta resource
app.get("/:uuid/meta/:type/:id.json", handleMeta);

// Admin panel
app.get("/admin", handleAdminPage);
app.get("/admin/api/users", handleAdminListUsers);
app.get("/admin/api/recommendations/:uuid", handleAdminGetRecommendations);
app.get("/admin/api/watch-history/:uuid", handleAdminGetWatchHistory);
app.post("/admin/api/refresh/:uuid", handleAdminForceRefresh);
app.delete("/admin/api/delete/:uuid", handleAdminDeleteUser);
app.post("/admin/api/regenerate-all", handleAdminRegenerateAll);
app.get("/admin/api/queue-status", handleAdminQueueStatus);
app.get("/admin/api/logs/:uuid", handleAdminUserLogs);
app.get("/admin/api/logs", handleAdminAllLogs);
app.post("/admin/api/prewarm", handleAdminPrewarm);

// 404 fallback
app.notFound((c) => {
  return c.json({ error: "Not found" }, 404);
});

// ─── Start Server ──────────────────────────────────────────────────────────────

const port = getPort();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Stremio AI Recommendations server running on port ${info.port}`);
});

export default app;
