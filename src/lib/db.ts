/**
 * PostgreSQL Database Client
 *
 * Provides a connection pool and query helper for the application.
 *
 * @module lib/db
 */

import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Execute a parameterized query against the database.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Get the raw pool instance (for graceful shutdown, etc.)
 */
export { pool };
