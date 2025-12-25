// SimPhanToe Contract ABI - extracted from compiled contract
// This matches the interface in contracts/SimPhanToe.sol

export const SIMPHANTOE_ABI = [
  // Events
  {
    type: "event",
    name: "GameStarted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player1", type: "address", indexed: true },
      { name: "stake", type: "uint256", indexed: false },
      { name: "moveTimeout", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PlayerJoined",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player2", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MoveSubmitted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MoveInvalid",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MoveMade",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MovesProcessed",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "Collision",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "GameUpdated",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "winner", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BoardRevealed",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "GameCancelled",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "GameTimeout",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
    ],
  },
  // Read functions
  {
    type: "function",
    name: "gameCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "games",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "gameId", type: "uint256" },
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
      // Note: eBoard is euint8[4][4] - encrypted, returned as bytes32[4][4] handles
      { name: "eBoard", type: "bytes32[4][4]" },
      { name: "eWinner", type: "bytes32" }, // euint8 handle
      { name: "eCollision", type: "bytes32" }, // ebool handle
      { name: "board", type: "uint8[4][4]" }, // cleartext board (revealed after game ends)
      { name: "winner", type: "uint8" }, // cleartext winner enum
      { name: "stake", type: "uint256" },
      { name: "moveTimeout", type: "uint256" },
      { name: "lastActionTimestamp", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGame",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "gameId", type: "uint256" },
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "eBoard", type: "bytes32[4][4]" }, // Encrypted cell handles
          { name: "eWinner", type: "bytes32" }, // euint8 handle
          { name: "eCollision", type: "bytes32" }, // ebool handle
          { name: "board", type: "uint8[4][4]" }, // cleartext board
          { name: "winner", type: "uint8" }, // cleartext winner enum
          { name: "stake", type: "uint256" },
          { name: "moveTimeout", type: "uint256" },
          { name: "lastActionTimestamp", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getOpenGames",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGamesByPlayer",
    inputs: [{ name: "_player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMoves",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [
      {
        name: "move1",
        type: "tuple",
        components: [
          { name: "isSubmitted", type: "bool" },
          { name: "isMade", type: "bool" },
          { name: "isInvalid", type: "bytes32" }, // ebool handle
          { name: "isCellOccupied", type: "bytes32" }, // ebool handle
          { name: "x", type: "bytes32" }, // euint8 handle
          { name: "y", type: "bytes32" }, // euint8 handle
        ],
      },
      {
        name: "move2",
        type: "tuple",
        components: [
          { name: "isSubmitted", type: "bool" },
          { name: "isMade", type: "bool" },
          { name: "isInvalid", type: "bytes32" }, // ebool handle
          { name: "isCellOccupied", type: "bytes32" }, // ebool handle
          { name: "x", type: "bytes32" }, // euint8 handle
          { name: "y", type: "bytes32" }, // euint8 handle
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextMoves",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "isSubmitted", type: "bool" },
      { name: "isMade", type: "bool" },
      { name: "isInvalid", type: "bytes32" },
      { name: "isCellOccupied", type: "bytes32" },
      { name: "x", type: "bytes32" },
      { name: "y", type: "bytes32" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canSubmitMove",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_player", type: "address" },
    ],
    outputs: [{ name: "canSubmit", type: "bool" }],
    stateMutability: "view",
  },
  // Write functions
  {
    type: "function",
    name: "startGame",
    inputs: [{ name: "_moveTimeout", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "joinGame",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "cancelGame",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimTimeout",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "submitMove",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_inputX", type: "bytes32" }, // externalEuint8
      { name: "_inputY", type: "bytes32" }, // externalEuint8
      { name: "_inputProof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "finalizeMove",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_player", type: "address" },
      { name: "_isInvalid", type: "bool" },
      { name: "_decryptionProof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "finalizeGameState",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_winner", type: "uint8" },
      { name: "_collision", type: "bool" },
      { name: "_decryptionProof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "revealBoard",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_board", type: "uint8[4][4]" },
      { name: "_decryptionProof", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Contract address - set via VITE_SIMPHANTOE_ADDRESS environment variable after deploying to Sepolia
export const SIMPHANTOE_ADDRESS = import.meta.env.VITE_SIMPHANTOE_ADDRESS as `0x${string}` | undefined;

// Cell enum values matching the contract (these are encrypted in the actual game)
export enum Cell {
  Empty = 0,
  Player1 = 1,
  Player2 = 2,
}

// Winner enum values matching the contract
export enum Winner {
  None = 0,
  Player1 = 1,
  Player2 = 2,
  Draw = 3,
  Cancelled = 4,
}

// Game type for TypeScript
// Note: In SimPhanToe, the board and some fields are encrypted (represented as bytes32 handles)
export interface Game {
  gameId: bigint;
  player1: `0x${string}`;
  player2: `0x${string}`;
  // Encrypted board - we store handles, not actual values
  eBoard: readonly (readonly `0x${string}`[])[];
  eWinner: `0x${string}`; // Handle to encrypted winner
  eCollision: `0x${string}`; // Handle to encrypted collision flag
  // Cleartext board (revealed after game ends)
  board: readonly (readonly number[])[];
  winner: number; // Cleartext winner enum
  stake: bigint; // ETH stake for the game
  moveTimeout: bigint; // Time limit for making moves
  lastActionTimestamp: bigint; // Timestamp of last action requiring a response
}

// Move type for SimPhanToe
// Note: x, y, isInvalid, isCellOccupied are all encrypted (bytes32 handles)
export interface Move {
  isSubmitted: boolean;
  isMade: boolean;
  isInvalid: `0x${string}`; // Handle to encrypted bool
  isCellOccupied: `0x${string}`; // Handle to encrypted bool
  x: `0x${string}`; // Handle to encrypted x coordinate
  y: `0x${string}`; // Handle to encrypted y coordinate
}

// Local move tracking (for UI - player's own moves are known locally)
export interface LocalMove {
  x: number;
  y: number;
  timestamp: number;
}

// Game state phases for UI
export enum GamePhase {
  WaitingForOpponent = "waiting_for_opponent",
  SelectingMove = "selecting_move",
  EncryptingMove = "encrypting_move",
  SubmittingMove = "submitting_move",
  WaitingForValidation = "waiting_for_validation",
  FinalizingMove = "finalizing_move",
  WaitingForOpponentMove = "waiting_for_opponent_move",
  ProcessingMoves = "processing_moves",
  DecryptingResult = "decrypting_result",
  FinalizingGameState = "finalizing_game_state",
  RevealingBoard = "revealing_board",
  RoundComplete = "round_complete",
  GameOver = "game_over",
}

// FHE operation status
export interface FHEOperationStatus {
  type: "encrypt" | "decrypt" | "idle";
  message: string;
  isLoading: boolean;
}

// Helper to check if game is finished (includes cancelled games)
export function isGameFinished(game: Game | undefined): boolean {
  return game !== undefined && game.winner !== Winner.None;
}

// Helper to check if game was cancelled
export function isGameCancelled(game: Game | undefined): boolean {
  return game !== undefined && game.winner === Winner.Cancelled;
}

// Helper to check if timeout can be claimed
export function canClaimTimeout(
  game: Game | undefined,
  currentTimestamp: bigint,
): boolean {
  if (!game || game.winner !== Winner.None) return false;
  if (game.player2 === "0x0000000000000000000000000000000000000000") return false;
  if (game.lastActionTimestamp === 0n) return false;
  return currentTimestamp > game.lastActionTimestamp + game.moveTimeout;
}

// Helper to check if board is revealed (any non-zero cell in cleartext board)
export function isBoardRevealed(game: Game | undefined): boolean {
  if (!game || game.winner === Winner.None) return false;
  // Check if any cell in the cleartext board has been set
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (game.board[i][j] !== 0) return true;
    }
  }
  return false;
}
