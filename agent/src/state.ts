// Agent state definition for LangGraph

import { Annotation } from "@langchain/langgraph";

// Game phases matching the contract lifecycle
export enum GamePhase {
  Idle = "idle",
  WaitingForOpponent = "waiting_for_opponent",
  SelectingMove = "selecting_move",
  SubmittingMove = "submitting_move",
  FinalizingMove = "finalizing_move",
  WaitingForOpponentMove = "waiting_for_opponent_move",
  FinalizingGameState = "finalizing_game_state",
  RevealingBoard = "revealing_board",
  GameComplete = "game_complete",
  Error = "error",
}

// Winner enum matching the contract
export enum Winner {
  None = 0,
  Player1 = 1,
  Player2 = 2,
  Draw = 3,
}

// Cell enum matching the contract
export enum Cell {
  Empty = 0,
  Player1 = 1,
  Player2 = 2,
}

// Local move tracking
export interface LocalMove {
  x: number;
  y: number;
  round: number;
}

// Move data from contract
export interface MoveData {
  isSubmitted: boolean;
  isMade: boolean;
  isInvalid: `0x${string}`;
  isCellOccupied: `0x${string}`;
  x: `0x${string}`;
  y: `0x${string}`;
}

// Game data from contract
export interface GameData {
  gameId: bigint;
  player1: `0x${string}`;
  player2: `0x${string}`;
  eBoard: readonly (readonly `0x${string}`[])[];
  eWinner: `0x${string}`;
  eCollision: `0x${string}`;
  board: readonly (readonly number[])[];
  winner: number;
}

// Agent state annotation for LangGraph
export const AgentStateAnnotation = Annotation.Root({
  // Game identification
  gameId: Annotation<bigint | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Player info
  playerAddress: Annotation<`0x${string}` | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  isPlayer1: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  // Game state
  currentPhase: Annotation<GamePhase>({
    reducer: (_, update) => update,
    default: () => GamePhase.Idle,
  }),
  winner: Annotation<Winner>({
    reducer: (_, update) => update,
    default: () => Winner.None,
  }),

  // Move tracking
  myMoves: Annotation<LocalMove[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),
  currentRound: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),
  pendingMove: Annotation<{ x: number; y: number } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Contract state cache
  game: Annotation<GameData | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  myMove: Annotation<MoveData | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  opponentMove: Annotation<MoveData | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Error tracking
  lastError: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
  retryCount: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  // Flow control
  shouldContinue: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => true,
  }),
  collisionOccurred: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),
});

// Type for the agent state
export type AgentState = typeof AgentStateAnnotation.State;

// Helper to create initial state
export function createInitialState(playerAddress: `0x${string}`): Partial<AgentState> {
  return {
    playerAddress,
    gameId: null,
    isPlayer1: false,
    currentPhase: GamePhase.Idle,
    winner: Winner.None,
    myMoves: [],
    currentRound: 0,
    pendingMove: null,
    game: null,
    myMove: null,
    opponentMove: null,
    lastError: null,
    retryCount: 0,
    shouldContinue: true,
    collisionOccurred: false,
  };
}

// Helper to check if game is finished
export function isGameFinished(winner: Winner): boolean {
  return winner !== Winner.None;
}

// Zero address constant
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

