// High-level game state operations for PostgreSQL persistence
// Provides type-safe access to game data, attempted moves, and tx markers

import { query, withTransaction } from "./db.js";
import { createLogger } from "../utils/logger.js";
import { GamePhase, Winner, type AgentState } from "../state.js";
import type pg from "pg";

const logger = createLogger("GameStore");

// Database record types
export interface GameRecord {
  game_id: bigint;
  chain_id: number;
  contract_address: string;
  player_address: string;
  is_player1: boolean;
  current_phase: string;
  current_round: number;
  winner: number;
  status: "active" | "completed" | "abandoned";
  waiting_since: Date | null;
  last_opponent_activity: Date | null;
  last_check_at: Date | null;
  next_check_at: Date | null;
  collision_occurred: boolean;
  pending_move_x: number | null;
  pending_move_y: number | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttemptedMoveRecord {
  id: number;
  chain_id: number;
  contract_address: string;
  game_id: bigint;
  x: number;
  y: number;
  round: number;
  status: "pending" | "confirmed" | "invalid" | "collision";
  tx_hash: string | null;
  created_at: Date;
}

export interface TxMarkerRecord {
  chain_id: number;
  contract_address: string;
  game_id: bigint;
  action: string;
  tx_hash: string | null;
  tx_status: "pending" | "confirmed" | "failed" | "dropped";
  block_number: bigint | null;
  params_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

// Game key for identifying games uniquely
export interface GameKey {
  chainId: number;
  contractAddress: string;
  gameId: bigint;
}

// Helper to create game key
export function createGameKey(
  chainId: number,
  contractAddress: string,
  gameId: bigint
): GameKey {
  return { chainId, contractAddress, gameId };
}

// ============================================================================
// Game Operations
// ============================================================================

export async function createGame(
  key: GameKey,
  data: {
    playerAddress: string;
    isPlayer1: boolean;
    currentPhase?: string;
    status?: "active" | "completed" | "abandoned";
    nextCheckAt?: Date;
  }
): Promise<void> {
  logger.info("Creating game record", { gameId: key.gameId.toString() });

  await query(
    `INSERT INTO games (
      game_id, chain_id, contract_address, player_address, is_player1,
      current_phase, status, next_check_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (chain_id, contract_address, game_id) DO UPDATE SET
      current_phase = EXCLUDED.current_phase,
      status = EXCLUDED.status,
      next_check_at = EXCLUDED.next_check_at,
      updated_at = NOW()`,
    [
      key.gameId.toString(),
      key.chainId,
      key.contractAddress,
      data.playerAddress,
      data.isPlayer1,
      data.currentPhase || "idle",
      data.status || "active",
      data.nextCheckAt || new Date(),
    ]
  );
}

export async function getGame(key: GameKey): Promise<GameRecord | null> {
  const result = await query<GameRecord>(
    `SELECT * FROM games WHERE chain_id = $1 AND contract_address = $2 AND game_id = $3`,
    [key.chainId, key.contractAddress, key.gameId.toString()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    game_id: BigInt(row.game_id),
  };
}

export async function updateGame(
  key: GameKey,
  updates: Partial<{
    currentPhase: string;
    currentRound: number;
    winner: number;
    status: "active" | "completed" | "abandoned";
    waitingSince: Date | null;
    lastOpponentActivity: Date | null;
    lastCheckAt: Date | null;
    nextCheckAt: Date | null;
    collisionOccurred: boolean;
    pendingMoveX: number | null;
    pendingMoveY: number | null;
    lastError: string | null;
    isPlayer1: boolean;
  }>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  // Build dynamic SET clauses
  if (updates.currentPhase !== undefined) {
    setClauses.push(`current_phase = $${paramIndex++}`);
    values.push(updates.currentPhase);
  }
  if (updates.currentRound !== undefined) {
    setClauses.push(`current_round = $${paramIndex++}`);
    values.push(updates.currentRound);
  }
  if (updates.winner !== undefined) {
    setClauses.push(`winner = $${paramIndex++}`);
    values.push(updates.winner);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(updates.status);
  }
  if (updates.waitingSince !== undefined) {
    setClauses.push(`waiting_since = $${paramIndex++}`);
    values.push(updates.waitingSince);
  }
  if (updates.lastOpponentActivity !== undefined) {
    setClauses.push(`last_opponent_activity = $${paramIndex++}`);
    values.push(updates.lastOpponentActivity);
  }
  if (updates.lastCheckAt !== undefined) {
    setClauses.push(`last_check_at = $${paramIndex++}`);
    values.push(updates.lastCheckAt);
  }
  if (updates.nextCheckAt !== undefined) {
    setClauses.push(`next_check_at = $${paramIndex++}`);
    values.push(updates.nextCheckAt);
  }
  if (updates.collisionOccurred !== undefined) {
    setClauses.push(`collision_occurred = $${paramIndex++}`);
    values.push(updates.collisionOccurred);
  }
  if (updates.pendingMoveX !== undefined) {
    setClauses.push(`pending_move_x = $${paramIndex++}`);
    values.push(updates.pendingMoveX);
  }
  if (updates.pendingMoveY !== undefined) {
    setClauses.push(`pending_move_y = $${paramIndex++}`);
    values.push(updates.pendingMoveY);
  }
  if (updates.lastError !== undefined) {
    setClauses.push(`last_error = $${paramIndex++}`);
    values.push(updates.lastError);
  }
  if (updates.isPlayer1 !== undefined) {
    setClauses.push(`is_player1 = $${paramIndex++}`);
    values.push(updates.isPlayer1);
  }

  if (setClauses.length === 0) {
    return; // Nothing to update
  }

  // Add WHERE clause parameters
  values.push(key.chainId, key.contractAddress, key.gameId.toString());

  await query(
    `UPDATE games SET ${setClauses.join(", ")}
     WHERE chain_id = $${paramIndex++} AND contract_address = $${paramIndex++} AND game_id = $${paramIndex}`,
    values
  );
}

export async function getActiveGames(
  chainId: number,
  contractAddress: string
): Promise<GameRecord[]> {
  const result = await query<GameRecord>(
    `SELECT * FROM games 
     WHERE chain_id = $1 AND contract_address = $2 AND status = 'active'
     ORDER BY created_at ASC`,
    [chainId, contractAddress]
  );

  return result.rows.map((row) => ({
    ...row,
    game_id: BigInt(row.game_id),
  }));
}

export async function getGamesReadyToCheck(
  chainId: number,
  contractAddress: string
): Promise<GameRecord[]> {
  const result = await query<GameRecord>(
    `SELECT * FROM games 
     WHERE chain_id = $1 AND contract_address = $2 
       AND status = 'active' 
       AND (next_check_at IS NULL OR next_check_at <= NOW())
     ORDER BY next_check_at ASC NULLS FIRST`,
    [chainId, contractAddress]
  );

  return result.rows.map((row) => ({
    ...row,
    game_id: BigInt(row.game_id),
  }));
}

export async function getGamesWaitingForOpponent(
  chainId: number,
  contractAddress: string
): Promise<GameRecord[]> {
  const result = await query<GameRecord>(
    `SELECT * FROM games 
     WHERE chain_id = $1 AND contract_address = $2 
       AND status = 'active' 
       AND current_phase = 'waiting_for_opponent'
     ORDER BY created_at ASC`,
    [chainId, contractAddress]
  );

  return result.rows.map((row) => ({
    ...row,
    game_id: BigInt(row.game_id),
  }));
}

// ============================================================================
// Attempted Moves Operations
// ============================================================================

export async function addAttemptedMove(
  key: GameKey,
  x: number,
  y: number,
  round: number,
  txHash?: string
): Promise<void> {
  logger.debug("Adding attempted move", {
    gameId: key.gameId.toString(),
    x,
    y,
    round,
  });

  await query(
    `INSERT INTO attempted_moves (chain_id, contract_address, game_id, x, y, round, tx_hash, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     ON CONFLICT (chain_id, contract_address, game_id, x, y, round) DO UPDATE SET
       tx_hash = COALESCE(EXCLUDED.tx_hash, attempted_moves.tx_hash),
       status = 'pending'`,
    [key.chainId, key.contractAddress, key.gameId.toString(), x, y, round, txHash || null]
  );
}

export async function updateAttemptedMoveStatus(
  key: GameKey,
  x: number,
  y: number,
  round: number,
  status: "pending" | "confirmed" | "invalid" | "collision"
): Promise<void> {
  await query(
    `UPDATE attempted_moves SET status = $1
     WHERE chain_id = $2 AND contract_address = $3 AND game_id = $4 AND x = $5 AND y = $6 AND round = $7`,
    [status, key.chainId, key.contractAddress, key.gameId.toString(), x, y, round]
  );
}

export async function getAttemptedMoves(key: GameKey): Promise<AttemptedMoveRecord[]> {
  const result = await query<AttemptedMoveRecord>(
    `SELECT * FROM attempted_moves 
     WHERE chain_id = $1 AND contract_address = $2 AND game_id = $3
     ORDER BY round ASC, created_at ASC`,
    [key.chainId, key.contractAddress, key.gameId.toString()]
  );

  return result.rows.map((row) => ({
    ...row,
    game_id: BigInt(row.game_id),
  }));
}

export async function getConfirmedMoves(key: GameKey): Promise<AttemptedMoveRecord[]> {
  const result = await query<AttemptedMoveRecord>(
    `SELECT * FROM attempted_moves 
     WHERE chain_id = $1 AND contract_address = $2 AND game_id = $3 AND status = 'confirmed'
     ORDER BY round ASC`,
    [key.chainId, key.contractAddress, key.gameId.toString()]
  );

  return result.rows.map((row) => ({
    ...row,
    game_id: BigInt(row.game_id),
  }));
}

// ============================================================================
// Transaction Marker Operations
// ============================================================================

export async function getTxMarker(
  key: GameKey,
  action: string
): Promise<TxMarkerRecord | null> {
  const result = await query<TxMarkerRecord>(
    `SELECT * FROM tx_markers 
     WHERE chain_id = $1 AND contract_address = $2 AND game_id = $3 AND action = $4`,
    [key.chainId, key.contractAddress, key.gameId.toString(), action]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    ...row,
    game_id: BigInt(row.game_id),
    block_number: row.block_number ? BigInt(row.block_number) : null,
  };
}

export async function setTxMarker(
  key: GameKey,
  action: string,
  data: {
    txHash: string;
    txStatus?: "pending" | "confirmed" | "failed" | "dropped";
    blockNumber?: bigint;
    paramsHash?: string;
  }
): Promise<void> {
  logger.debug("Setting tx marker", {
    gameId: key.gameId.toString(),
    action,
    txHash: data.txHash,
  });

  await query(
    `INSERT INTO tx_markers (chain_id, contract_address, game_id, action, tx_hash, tx_status, block_number, params_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (chain_id, contract_address, game_id, action) DO UPDATE SET
       tx_hash = EXCLUDED.tx_hash,
       tx_status = EXCLUDED.tx_status,
       block_number = EXCLUDED.block_number,
       params_hash = EXCLUDED.params_hash`,
    [
      key.chainId,
      key.contractAddress,
      key.gameId.toString(),
      action,
      data.txHash,
      data.txStatus || "pending",
      data.blockNumber?.toString() || null,
      data.paramsHash || null,
    ]
  );
}

export async function updateTxMarker(
  key: GameKey,
  action: string,
  updates: Partial<{
    txStatus: "pending" | "confirmed" | "failed" | "dropped";
    blockNumber: bigint;
  }>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.txStatus !== undefined) {
    setClauses.push(`tx_status = $${paramIndex++}`);
    values.push(updates.txStatus);
  }
  if (updates.blockNumber !== undefined) {
    setClauses.push(`block_number = $${paramIndex++}`);
    values.push(updates.blockNumber.toString());
  }

  if (setClauses.length === 0) {
    return;
  }

  values.push(key.chainId, key.contractAddress, key.gameId.toString(), action);

  await query(
    `UPDATE tx_markers SET ${setClauses.join(", ")}
     WHERE chain_id = $${paramIndex++} AND contract_address = $${paramIndex++} 
       AND game_id = $${paramIndex++} AND action = $${paramIndex}`,
    values
  );
}

export async function clearTxMarker(key: GameKey, action: string): Promise<void> {
  await query(
    `DELETE FROM tx_markers 
     WHERE chain_id = $1 AND contract_address = $2 AND game_id = $3 AND action = $4`,
    [key.chainId, key.contractAddress, key.gameId.toString(), action]
  );
}

// ============================================================================
// State Conversion Helpers
// ============================================================================

// Convert AgentState to database updates
export function agentStateToDbUpdates(state: AgentState): Parameters<typeof updateGame>[1] {
  return {
    currentPhase: state.currentPhase,
    currentRound: state.currentRound,
    winner: state.winner,
    collisionOccurred: state.collisionOccurred,
    pendingMoveX: state.pendingMove?.x ?? null,
    pendingMoveY: state.pendingMove?.y ?? null,
    lastError: state.lastError,
    isPlayer1: state.isPlayer1,
    waitingSince: state.waitingSince ? new Date(state.waitingSince) : null,
  };
}

// Convert database record to partial AgentState
export function dbRecordToAgentState(record: GameRecord): Partial<AgentState> {
  return {
    gameId: record.game_id,
    isPlayer1: record.is_player1,
    currentPhase: record.current_phase as GamePhase,
    currentRound: record.current_round,
    winner: record.winner as Winner,
    collisionOccurred: record.collision_occurred,
    pendingMove:
      record.pending_move_x !== null && record.pending_move_y !== null
        ? { x: record.pending_move_x, y: record.pending_move_y }
        : null,
    lastError: record.last_error,
    waitingSince: record.waiting_since?.getTime() ?? null,
  };
}

// Save full game state to database
export async function saveGameState(
  key: GameKey,
  state: AgentState,
  scheduling?: { nextCheckAt?: Date }
): Promise<void> {
  const updates = agentStateToDbUpdates(state);

  if (scheduling?.nextCheckAt) {
    updates.nextCheckAt = scheduling.nextCheckAt;
  }
  updates.lastCheckAt = new Date();

  // Mark completed games
  if (state.currentPhase === GamePhase.GameComplete) {
    updates.status = "completed";
  }

  await updateGame(key, updates);
}

// Load game state from database
export async function loadGameState(key: GameKey): Promise<Partial<AgentState> | null> {
  const record = await getGame(key);
  if (!record) {
    return null;
  }

  const state = dbRecordToAgentState(record);

  // Load attempted moves into myMoves
  const attemptedMoves = await getConfirmedMoves(key);
  state.myMoves = attemptedMoves.map((m) => ({
    x: m.x,
    y: m.y,
    round: m.round,
  }));

  return state;
}

