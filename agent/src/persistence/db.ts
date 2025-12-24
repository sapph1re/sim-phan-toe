// PostgreSQL database connection and initialization
// Uses pg library for connection pooling

import pg from "pg";
import { createLogger } from "../utils/logger.js";

const { Pool } = pg;
const logger = createLogger("DB");

// Inline schema (idempotent - safe to run multiple times)
const SCHEMA = `
-- Games table: tracks all games this agent is participating in
CREATE TABLE IF NOT EXISTS games (
  game_id BIGINT NOT NULL,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  player_address TEXT NOT NULL,
  is_player1 BOOLEAN NOT NULL,
  current_phase TEXT NOT NULL DEFAULT 'idle',
  current_round INTEGER NOT NULL DEFAULT 0,
  winner INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  waiting_since TIMESTAMPTZ,
  last_opponent_activity TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  collision_occurred BOOLEAN DEFAULT FALSE,
  pending_move_x INTEGER,
  pending_move_y INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chain_id, contract_address, game_id)
);

-- Attempted moves: critical for phantom game logic
CREATE TABLE IF NOT EXISTS attempted_moves (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  game_id BIGINT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  round INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chain_id, contract_address, game_id, x, y, round)
);

-- Idempotency markers: prevent duplicate transactions
CREATE TABLE IF NOT EXISTS tx_markers (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  game_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  tx_hash TEXT,
  tx_status TEXT DEFAULT 'pending',
  block_number BIGINT,
  params_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chain_id, contract_address, game_id, action)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_next_check ON games(next_check_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_games_waiting ON games(current_phase) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_attempted_moves_game ON attempted_moves(chain_id, contract_address, game_id);
CREATE INDEX IF NOT EXISTS idx_tx_markers_game ON tx_markers(chain_id, contract_address, game_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON games
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tx_markers_updated_at ON tx_markers;
CREATE TRIGGER update_tx_markers_updated_at
  BEFORE UPDATE ON tx_markers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`;

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
    // Execute the schema - all statements use IF NOT EXISTS/CREATE OR REPLACE
    await query(SCHEMA);

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
