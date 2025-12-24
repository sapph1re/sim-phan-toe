// PostgreSQL database connection and initialization
// Uses pg library for connection pooling

import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createLogger } from "../utils/logger.js";

const { Pool } = pg;
const logger = createLogger("DB");

// Get the directory of this file for loading schema.sql
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database configuration from environment
export interface DBConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

function getDBConfig(): DBConfig {
  const host = process.env.POSTGRES_HOST || "localhost";
  const port = parseInt(process.env.POSTGRES_PORT || "5432", 10);
  const database = process.env.POSTGRES_DATABASE || "simphantoe";
  const user = process.env.POSTGRES_USER || "postgres";
  const password = process.env.POSTGRES_PASSWORD || "";

  return { host, port, database, user, password };
}

// Singleton pool instance
let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const config = getDBConfig();
    pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 10, // Maximum connections in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Log connection events
    pool.on("connect", () => {
      logger.debug("New database connection established");
    });

    pool.on("error", (err) => {
      logger.error("Unexpected database pool error", err);
    });

    logger.info("Database pool initialized", {
      host: config.host,
      port: config.port,
      database: config.database,
    });
  }

  return pool;
}

// Execute a query with automatic connection handling
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  const start = Date.now();

  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;

    logger.debug("Query executed", {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rowCount: result.rowCount,
    });

    return result;
  } catch (error) {
    logger.error("Query failed", error, { query: text.substring(0, 100) });
    throw error;
  }
}

// Initialize the database schema (idempotent - safe to run multiple times)
export async function initializeDatabase(): Promise<void> {
  logger.info("Initializing database schema (idempotent)...");

  try {
    // Read the schema file
    const schemaPath = join(__dirname, "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");

    // Execute the schema - all statements use IF NOT EXISTS/CREATE OR REPLACE
    await query(schema);

    logger.info("Database schema initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize database schema", error);
    throw error;
  }
}

// Close the database pool (for graceful shutdown)
export async function closePool(): Promise<void> {
  if (pool) {
    logger.info("Closing database pool...");
    await pool.end();
    pool = null;
    logger.info("Database pool closed");
  }
}

// Transaction helper
export async function withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
