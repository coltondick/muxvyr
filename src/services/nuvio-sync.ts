/**
 * Nuvio Sync Client
 *
 * Authenticates with the Nuvio Cloud API and persists the session (access token
 * + refresh token) in Redis so watch history can be fetched without re-logging
 * in on every request. Tokens are refreshed automatically when expired.
 *
 * @module nuvio-sync
 */

import { redis } from "../lib/redis.js";
import crypto from "node:crypto";

/** Nuvio API base URL */
const NUVIO_API_BASE = "https://api.nuvio.tv";

/** Nuvio publishable API key (public, required for all requests) */
const NUVIO_PUBLISHABLE_KEY = "sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN";

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10_000;

/** Session TTL in Redis (23 hours — shorter than token expiry for safety) */
const SESSION_TTL_SECONDS = 82800;

/**
 * Represents a single item from the user's watch history.
 */
export interface WatchHistoryItem {
  title: string;
  type: "movie" | "series";
  imdb_id?: string;
  year?: number;
  watched_at: string;
}

/**
 * Nuvio auth credentials stored per user configuration.
 */
export interface NuvioCredentials {
  email: string;
  password: string;
  profile_id?: number;
}

/**
 * Persisted Nuvio session stored in Redis.
 */
export interface NuvioSession {
  access_token: string;
  refresh_token: string;
}

/**
 * Custom error class for Nuvio Sync failures.
 */
export class NuvioSyncError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = "NUVIO_SYNC_FAILED") {
    super(message);
    this.name = "NuvioSyncError";
    this.code = code;
  }
}

interface NuvioAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: { id: string; email: string };
}

interface NuvioWatchedItem {
  content_id: string;
  content_type: "movie" | "series";
  title: string;
  season?: number | null;
  episode?: number | null;
  watched_at: number;
}

// ─── Session Management ────────────────────────────────────────────────────────

async function getStoredSession(uuid: string): Promise<NuvioSession | null> {
  const key = `nuvio:session:${uuid}`;
  try {
    const result = await redis.get(key);
    if (!result) return null;
    return JSON.parse(result) as NuvioSession;
  } catch {
    return null;
  }
}

async function storeSession(uuid: string, session: NuvioSession): Promise<void> {
  const key = `nuvio:session:${uuid}`;
  try {
    await redis.setex(key, SESSION_TTL_SECONDS, JSON.stringify(session));
  } catch {
    // Non-fatal
  }
}

export async function clearNuvioSession(uuid: string): Promise<void> {
  const key = `nuvio:session:${uuid}`;
  try {
    await redis.del(key);
  } catch {
    // Non-fatal
  }
}

// ─── Authentication ────────────────────────────────────────────────────────────

export async function nuvioLogin(
  email: string,
  password: string,
  baseUrl: string = NUVIO_API_BASE
): Promise<NuvioSession> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: NUVIO_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      }
    );

    if (response.status === 401 || response.status === 400) {
      throw new NuvioSyncError(
        "Authentication failed: invalid Nuvio email or password",
        "NUVIO_SYNC_FAILED"
      );
    }

    if (!response.ok) {
      throw new NuvioSyncError(
        `Nuvio auth API returned status ${response.status}`,
        "NUVIO_SYNC_FAILED"
      );
    }

    const data = (await response.json()) as NuvioAuthResponse;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  } catch (error) {
    if (error instanceof NuvioSyncError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NuvioSyncError(
        "Nuvio auth request timed out after 10 seconds",
        "NUVIO_SYNC_FAILED"
      );
    }
    throw new NuvioSyncError(
      `Failed to connect to Nuvio: ${error instanceof Error ? error.message : "Unknown error"}`,
      "NUVIO_SYNC_FAILED"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function refreshAccessToken(
  refreshToken: string,
  baseUrl: string = NUVIO_API_BASE
): Promise<NuvioSession | null> {
  try {
    const response = await fetch(
      `${baseUrl}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: NUVIO_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as NuvioAuthResponse;
    return { access_token: data.access_token, refresh_token: data.refresh_token };
  } catch {
    return null;
  }
}

// ─── Watch History ─────────────────────────────────────────────────────────────

async function fetchWatchHistoryWithToken(
  accessToken: string,
  profileId: number,
  baseUrl: string = NUVIO_API_BASE
): Promise<WatchHistoryItem[] | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${baseUrl}/rest/v1/rpc/sync_pull_watched_items`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: NUVIO_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ p_profile_id: profileId, p_page: 1, p_page_size: 500 }),
        signal: controller.signal,
      }
    );

    if (response.status === 401) return null;

    if (!response.ok) {
      throw new NuvioSyncError(
        `Nuvio Sync API returned status ${response.status}`,
        "NUVIO_SYNC_FAILED"
      );
    }

    const data = (await response.json()) as NuvioWatchedItem[];
    return data.map(mapNuvioItemToWatchHistory);
  } catch (error) {
    if (error instanceof NuvioSyncError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new NuvioSyncError(
        "Nuvio Sync API request timed out after 10 seconds",
        "NUVIO_SYNC_FAILED"
      );
    }
    throw new NuvioSyncError(
      `Failed to connect to Nuvio Sync: ${error instanceof Error ? error.message : "Unknown error"}`,
      "NUVIO_SYNC_FAILED"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the user's watch history with session persistence.
 */
export async function fetchWatchHistory(
  credentials: string,
  uuid?: string,
  baseUrl: string = NUVIO_API_BASE
): Promise<WatchHistoryItem[]> {
  let parsedCreds: NuvioCredentials;
  try {
    parsedCreds = JSON.parse(credentials) as NuvioCredentials;
  } catch {
    throw new NuvioSyncError(
      "Invalid Nuvio credentials format: expected JSON with email and password",
      "NUVIO_SYNC_FAILED"
    );
  }

  if (!parsedCreds.email || !parsedCreds.password) {
    throw new NuvioSyncError(
      "Invalid Nuvio credentials: email and password are required",
      "NUVIO_SYNC_FAILED"
    );
  }

  const profileId = parsedCreds.profile_id ?? 1;

  // Try stored session first
  if (uuid) {
    const storedSession = await getStoredSession(uuid);

    if (storedSession) {
      const result = await fetchWatchHistoryWithToken(
        storedSession.access_token,
        profileId,
        baseUrl
      );
      if (result !== null) return result;

      const refreshed = await refreshAccessToken(storedSession.refresh_token, baseUrl);
      if (refreshed) {
        await storeSession(uuid, refreshed);
        const refreshResult = await fetchWatchHistoryWithToken(
          refreshed.access_token,
          profileId,
          baseUrl
        );
        if (refreshResult !== null) return refreshResult;
      }
    }
  }

  // Full login
  const session = await nuvioLogin(parsedCreds.email, parsedCreds.password, baseUrl);
  if (uuid) {
    await storeSession(uuid, session);
  }

  const result = await fetchWatchHistoryWithToken(session.access_token, profileId, baseUrl);
  if (result === null) {
    throw new NuvioSyncError(
      "Authentication failed: new session token was immediately rejected",
      "NUVIO_SYNC_FAILED"
    );
  }

  return result;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mapNuvioItemToWatchHistory(item: NuvioWatchedItem): WatchHistoryItem {
  let imdbId: string | undefined;
  if (item.content_id.startsWith("tt")) {
    imdbId = item.content_id;
  }
  return {
    title: item.title || "Unknown",
    type: item.content_type === "series" ? "series" : "movie",
    imdb_id: imdbId,
    watched_at: new Date(item.watched_at).toISOString(),
  };
}

/**
 * Computes a SHA-256 hash of the serialized watch history for change detection.
 */
export async function computeWatchHistoryHash(
  history: WatchHistoryItem[]
): Promise<string> {
  const serialized = JSON.stringify(history);
  const hash = crypto.createHash("sha256").update(serialized).digest("hex");
  return hash;
}

/**
 * Determines if the user's watch history has changed by comparing hash in Redis.
 */
export async function hasWatchHistoryChanged(
  uuid: string,
  history: WatchHistoryItem[]
): Promise<boolean> {
  const currentHash = await computeWatchHistoryHash(history);
  const redisKey = `watchhist:${uuid}:hash`;

  const storedHash = await redis.get(redisKey);
  if (storedHash === currentHash) return false;

  await redis.setex(redisKey, 3600, currentHash);
  return true;
}
