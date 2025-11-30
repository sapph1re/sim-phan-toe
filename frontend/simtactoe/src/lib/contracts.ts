// SimTacToe Contract ABI - extracted from compiled contract
// This matches the interface in contracts/SimTacToe.sol

export const SIMTACTOE_ABI = [
  // Events
  {
    type: "event",
    name: "GameStarted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "playerOne", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PlayerJoined",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "playerTwo", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MoveSubmitted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "player", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MoveMade",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "x", type: "uint8", indexed: false },
      { name: "y", type: "uint8", indexed: false },
      { name: "player", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MovesCollided",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "x", type: "uint8", indexed: false },
      { name: "y", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameEnded",
    inputs: [
      { name: "gameId", type: "uint256", indexed: false },
      { name: "winner", type: "uint8", indexed: false },
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
      { name: "playerOne", type: "address" },
      { name: "playerTwo", type: "address" },
      { name: "board", type: "uint8[3][3]" },
      { name: "winner", type: "uint8" },
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
          { name: "playerOne", type: "address" },
          { name: "playerTwo", type: "address" },
          { name: "board", type: "uint8[3][3]" },
          { name: "winner", type: "uint8" },
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
    name: "nextMoves",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [
      { name: "isMade", type: "bool" },
      { name: "x", type: "uint8" },
      { name: "y", type: "uint8" },
    ],
    stateMutability: "view",
  },
  // Write functions
  {
    type: "function",
    name: "startGame",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "joinGame",
    inputs: [{ name: "_gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "makeMove",
    inputs: [
      { name: "_gameId", type: "uint256" },
      { name: "_x", type: "uint8" },
      { name: "_y", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// Contract address - update this after deployment
// For local development, this will be set after running `npx hardhat deploy --network localhost`
export const SIMTACTOE_ADDRESS = import.meta.env.VITE_SIMTACTOE_ADDRESS as `0x${string}` | undefined;

// Cell enum values matching the contract
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
}

// Game type for TypeScript
export interface Game {
  gameId: bigint;
  playerOne: `0x${string}`;
  playerTwo: `0x${string}`;
  board: readonly (readonly number[])[];
  winner: number;
}

// Move type
export interface Move {
  isMade: boolean;
  x: number;
  y: number;
}
