-- SimPhanToe Agent PostgreSQL Schema
-- Tracks game state, attempted moves, and transaction idempotency markers

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
  -- Game lifecycle status
  status TEXT NOT NULL DEFAULT 'active', -- active, completed, abandoned
  -- Waiting tracking (no timeout errors - humans have lives!)
  waiting_since TIMESTAMPTZ,             -- when we started waiting for current phase
  last_opponent_activity TIMESTAMPTZ,    -- last time opponent did something
  last_check_at TIMESTAMPTZ,             -- last time we checked this game
  next_check_at TIMESTAMPTZ,             -- when to check this game next
  -- Additional state fields
  collision_occurred BOOLEAN DEFAULT FALSE,
  pending_move_x INTEGER,
  pending_move_y INTEGER,
  -- Metadata
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (chain_id, contract_address, game_id)
);

-- Attempted moves: critical for phantom game logic
-- The agent must remember its own attempted moves since the encrypted board
-- cannot reveal which cells are occupied
CREATE TABLE IF NOT EXISTS attempted_moves (
  id SERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  game_id BIGINT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  round INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, invalid, collision
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chain_id, contract_address, game_id, x, y, round)
);

-- Idempotency markers: prevent duplicate transactions
-- Before sending any tx, check if we already have a marker for this action
CREATE TABLE IF NOT EXISTS tx_markers (
  chain_id INTEGER NOT NULL,
  contract_address TEXT NOT NULL,
  game_id BIGINT NOT NULL,
  action TEXT NOT NULL, -- submitMove, finalizeMove, finalizeGameState, revealBoard
  tx_hash TEXT,
  tx_status TEXT DEFAULT 'pending', -- pending, confirmed, failed, dropped
  block_number BIGINT,
  params_hash TEXT, -- hash of action parameters for verification
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

