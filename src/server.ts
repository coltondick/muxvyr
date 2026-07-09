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
} from "./handlers/admin.js";
import { getPort } from "./lib/config.js";

const app = new Hono();

// Global middleware
app.use("*", securityMiddleware);
app.use("*", rateLimitMiddleware());

// ─── Routes ────────────────────────────────────────────────────────────────────

// Landing page
app.get("/", handleLandingPage);

// Configuration pages
app.get("/configure", handleGetNewConfigure);
app.post("/configure", handleCreateConfigure);
app.get("/:uuid/configure", handleGetConfigure);
app.post("/:uuid/configure", handlePostConfigure);

// Nuvio verification
app.post("/api/verify-nuvio", handleVerifyNuvio);

// Stremio manifest
app.get("/:uuid/manifest.json", handleManifest);

// Stremio catalog
app.get("/:uuid/catalog/:type/:id.json", handleCatalog);

// Admin panel
app.get("/admin", handleAdminPage);
app.get("/admin/api/users", handleAdminListUsers);
app.get("/admin/api/recommendations/:uuid", handleAdminGetRecommendations);
app.get("/admin/api/watch-history/:uuid", handleAdminGetWatchHistory);
app.post("/admin/api/refresh/:uuid", handleAdminForceRefresh);
app.delete("/admin/api/delete/:uuid", handleAdminDeleteUser);

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
