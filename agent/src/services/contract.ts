// Contract service for interacting with SimPhanToe on Sepolia

import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
  parseEventLogs,
  type PublicClient,
  type WalletClient,
  type GetContractReturnType,
  type Account,
  toHex,
} from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createLogger } from "../utils/logger.js";
import type { GameData, MoveData } from "../state.js";

const logger = createLogger("Contract");

// Contract ABI - matches frontend/simphantoe/src/lib/contracts.ts
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
          { name: "eBoard", type: "bytes32[4][4]" },
          { name: "eWinner", type: "bytes32" },
          { name: "eCollision", type: "bytes32" },
          { name: "board", type: "uint8[4][4]" },
          { name: "winner", type: "uint8" },
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
          { name: "isInvalid", type: "bytes32" },
          { name: "isCellOccupied", type: "bytes32" },
          { name: "x", type: "bytes32" },
          { name: "y", type: "bytes32" },
        ],
      },
      {
        name: "move2",
        type: "tuple",
        components: [
          { name: "isSubmitted", type: "bool" },
          { name: "isMade", type: "bool" },
          { name: "isInvalid", type: "bytes32" },
          { name: "isCellOccupied", type: "bytes32" },
          { name: "x", type: "bytes32" },
          { name: "y", type: "bytes32" },
        ],
      },
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
      { name: "_inputX", type: "bytes32" },
      { name: "_inputY", type: "bytes32" },
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

export class ContractService {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private account: Account;
  private contractAddress: `0x${string}`;
  private contract: GetContractReturnType<typeof SIMPHANTOE_ABI, PublicClient>;

  constructor() {
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.SIMPHANTOE_ADDRESS;
    const rpcUrl = process.env.SEPOLIA_RPC_URL;

    if (!privateKey) {
      throw new Error("PRIVATE_KEY environment variable is required");
    }
    if (!contractAddress) {
      throw new Error("SIMPHANTOE_ADDRESS environment variable is required");
    }
    if (!rpcUrl) {
      throw new Error("SEPOLIA_RPC_URL environment variable is required");
    }

    this.contractAddress = contractAddress as `0x${string}`;
    this.account = privateKeyToAccount(privateKey as `0x${string}`);

    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: sepolia,
      transport: http(rpcUrl),
    });

    this.contract = getContract({
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      client: this.publicClient,
    });

    logger.info("Contract service initialized", {
      address: this.account.address,
      contract: this.contractAddress,
    });
  }

  get address(): `0x${string}` {
    return this.account.address;
  }

  get simphantoeAddress(): `0x${string}` {
    return this.contractAddress;
  }

  // Get ETH balance of an address
  async getBalance(address?: `0x${string}`): Promise<bigint> {
    const targetAddress = address || this.account.address;
    const balance = await this.publicClient.getBalance({ address: targetAddress });
    return balance;
  }

  // Get ETH balance formatted as a string with units
  async getBalanceFormatted(address?: `0x${string}`): Promise<string> {
    const balance = await this.getBalance(address);
    // Convert wei to ETH (18 decimals)
    const ethBalance = Number(balance) / 1e18;
    return `${ethBalance.toFixed(6)} ETH`;
  }

  // Read functions
  async getGameCount(): Promise<bigint> {
    const count = await this.contract.read.gameCount();
    return count;
  }

  async getOpenGames(): Promise<bigint[]> {
    const games = await this.contract.read.getOpenGames();
    return [...games];
  }

  async getGamesByPlayer(player: `0x${string}`): Promise<bigint[]> {
    const games = await this.contract.read.getGamesByPlayer([player]);
    return [...games];
  }

  async getGame(gameId: bigint): Promise<GameData> {
    const game = await this.contract.read.getGame([gameId]);
    return {
      gameId: game.gameId,
      player1: game.player1,
      player2: game.player2,
      eBoard: game.eBoard,
      eWinner: game.eWinner,
      eCollision: game.eCollision,
      board: game.board,
      winner: game.winner,
      stake: game.stake,
      moveTimeout: game.moveTimeout,
      lastActionTimestamp: game.lastActionTimestamp,
    };
  }

  async getMoves(gameId: bigint): Promise<[MoveData, MoveData]> {
    const [move1, move2] = await this.contract.read.getMoves([gameId]);
    return [
      {
        isSubmitted: move1.isSubmitted,
        isMade: move1.isMade,
        isInvalid: move1.isInvalid,
        isCellOccupied: move1.isCellOccupied,
        x: move1.x,
        y: move1.y,
      },
      {
        isSubmitted: move2.isSubmitted,
        isMade: move2.isMade,
        isInvalid: move2.isInvalid,
        isCellOccupied: move2.isCellOccupied,
        x: move2.x,
        y: move2.y,
      },
    ];
  }

  async canSubmitMove(gameId: bigint, player: `0x${string}`): Promise<boolean> {
    const canSubmit = await this.contract.read.canSubmitMove([gameId, player]);
    return canSubmit;
  }

  /**
   * OPTIMIZED: Batch fetch game data and moves in a single RPC call using multicall
   * This reduces RPC calls from 2 to 1 for game state checks
   */
  async getGameWithMoves(gameId: bigint): Promise<{ game: GameData; moves: [MoveData, MoveData] }> {
    const results = await this.publicClient.multicall({
      contracts: [
        {
          address: this.contractAddress,
          abi: SIMPHANTOE_ABI,
          functionName: "getGame",
          args: [gameId],
        },
        {
          address: this.contractAddress,
          abi: SIMPHANTOE_ABI,
          functionName: "getMoves",
          args: [gameId],
        },
      ],
    });

    // Handle potential failures
    if (results[0].status === "failure") {
      throw new Error(`Failed to get game: ${results[0].error?.message || "Unknown error"}`);
    }
    if (results[1].status === "failure") {
      throw new Error(`Failed to get moves: ${results[1].error?.message || "Unknown error"}`);
    }

    const gameResult = results[0].result as {
      gameId: bigint;
      player1: `0x${string}`;
      player2: `0x${string}`;
      eBoard: readonly (readonly `0x${string}`[])[];
      eWinner: `0x${string}`;
      eCollision: `0x${string}`;
      board: readonly (readonly number[])[];
      winner: number;
      stake: bigint;
      moveTimeout: bigint;
      lastActionTimestamp: bigint;
    };

    const movesResult = results[1].result as readonly [
      { isSubmitted: boolean; isMade: boolean; isInvalid: `0x${string}`; isCellOccupied: `0x${string}`; x: `0x${string}`; y: `0x${string}` },
      { isSubmitted: boolean; isMade: boolean; isInvalid: `0x${string}`; isCellOccupied: `0x${string}`; x: `0x${string}`; y: `0x${string}` },
    ];

    const game: GameData = {
      gameId: gameResult.gameId,
      player1: gameResult.player1,
      player2: gameResult.player2,
      eBoard: gameResult.eBoard,
      eWinner: gameResult.eWinner,
      eCollision: gameResult.eCollision,
      board: gameResult.board,
      winner: gameResult.winner,
      stake: gameResult.stake,
      moveTimeout: gameResult.moveTimeout,
      lastActionTimestamp: gameResult.lastActionTimestamp,
    };

    const moves: [MoveData, MoveData] = [
      {
        isSubmitted: movesResult[0].isSubmitted,
        isMade: movesResult[0].isMade,
        isInvalid: movesResult[0].isInvalid,
        isCellOccupied: movesResult[0].isCellOccupied,
        x: movesResult[0].x,
        y: movesResult[0].y,
      },
      {
        isSubmitted: movesResult[1].isSubmitted,
        isMade: movesResult[1].isMade,
        isInvalid: movesResult[1].isInvalid,
        isCellOccupied: movesResult[1].isCellOccupied,
        x: movesResult[1].x,
        y: movesResult[1].y,
      },
    ];

    return { game, moves };
  }

  /**
   * OPTIMIZED: Batch fetch game data, moves, and canSubmitMove in a single RPC call
   * This reduces RPC calls from 3 to 1 for comprehensive game state checks
   */
  async getGameState(gameId: bigint, player: `0x${string}`): Promise<{
    game: GameData;
    moves: [MoveData, MoveData];
    canSubmit: boolean;
  }> {
    const results = await this.publicClient.multicall({
      contracts: [
        {
          address: this.contractAddress,
          abi: SIMPHANTOE_ABI,
          functionName: "getGame",
          args: [gameId],
        },
        {
          address: this.contractAddress,
          abi: SIMPHANTOE_ABI,
          functionName: "getMoves",
          args: [gameId],
        },
        {
          address: this.contractAddress,
          abi: SIMPHANTOE_ABI,
          functionName: "canSubmitMove",
          args: [gameId, player],
        },
      ],
    });

    // Handle potential failures
    if (results[0].status === "failure") {
      throw new Error(`Failed to get game: ${results[0].error?.message || "Unknown error"}`);
    }
    if (results[1].status === "failure") {
      throw new Error(`Failed to get moves: ${results[1].error?.message || "Unknown error"}`);
    }
    if (results[2].status === "failure") {
      throw new Error(`Failed to check canSubmitMove: ${results[2].error?.message || "Unknown error"}`);
    }

    const gameResult = results[0].result as {
      gameId: bigint;
      player1: `0x${string}`;
      player2: `0x${string}`;
      eBoard: readonly (readonly `0x${string}`[])[];
      eWinner: `0x${string}`;
      eCollision: `0x${string}`;
      board: readonly (readonly number[])[];
      winner: number;
      stake: bigint;
      moveTimeout: bigint;
      lastActionTimestamp: bigint;
    };

    const movesResult = results[1].result as readonly [
      { isSubmitted: boolean; isMade: boolean; isInvalid: `0x${string}`; isCellOccupied: `0x${string}`; x: `0x${string}`; y: `0x${string}` },
      { isSubmitted: boolean; isMade: boolean; isInvalid: `0x${string}`; isCellOccupied: `0x${string}`; x: `0x${string}`; y: `0x${string}` },
    ];

    const game: GameData = {
      gameId: gameResult.gameId,
      player1: gameResult.player1,
      player2: gameResult.player2,
      eBoard: gameResult.eBoard,
      eWinner: gameResult.eWinner,
      eCollision: gameResult.eCollision,
      board: gameResult.board,
      winner: gameResult.winner,
      stake: gameResult.stake,
      moveTimeout: gameResult.moveTimeout,
      lastActionTimestamp: gameResult.lastActionTimestamp,
    };

    const moves: [MoveData, MoveData] = [
      {
        isSubmitted: movesResult[0].isSubmitted,
        isMade: movesResult[0].isMade,
        isInvalid: movesResult[0].isInvalid,
        isCellOccupied: movesResult[0].isCellOccupied,
        x: movesResult[0].x,
        y: movesResult[0].y,
      },
      {
        isSubmitted: movesResult[1].isSubmitted,
        isMade: movesResult[1].isMade,
        isInvalid: movesResult[1].isInvalid,
        isCellOccupied: movesResult[1].isCellOccupied,
        x: movesResult[1].x,
        y: movesResult[1].y,
      },
    ];

    return { game, moves, canSubmit: results[2].result as boolean };
  }

  // Write functions
  async startGame(moveTimeout: bigint, stake?: bigint): Promise<{ txHash: `0x${string}`; gameId: bigint }> {
    logger.info("Starting new game...", { moveTimeout: moveTimeout.toString(), stake: stake?.toString() || "0" });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "startGame",
      args: [moveTimeout],
      value: stake ?? 0n,
    });

    logger.debug("Transaction submitted", { txHash });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.debug("Transaction confirmed", { blockNumber: receipt.blockNumber });

    // Parse GameStarted event from receipt logs using ABI decoding
    // This is the correct way - don't use gameCount - 1 (race condition!)
    const logs = parseEventLogs({
      abi: SIMPHANTOE_ABI,
      logs: receipt.logs,
      eventName: "GameStarted",
    });

    if (logs.length === 0) {
      // Fallback: if event parsing fails, try to re-query logs
      logger.warn("GameStarted event not found in receipt, attempting fallback query...");

      const blockLogs = await this.publicClient.getLogs({
        address: this.contractAddress,
        event: {
          type: "event",
          name: "GameStarted",
          inputs: [
            { name: "gameId", type: "uint256", indexed: true },
            { name: "player1", type: "address", indexed: true },
            { name: "stake", type: "uint256", indexed: false },
            { name: "moveTimeout", type: "uint256", indexed: false },
          ],
        },
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      const ourLog = blockLogs.find((log) => log.transactionHash === txHash);

      if (!ourLog || !ourLog.args.gameId) {
        throw new Error("GameStarted event not found in transaction receipt or block logs");
      }

      const gameId = ourLog.args.gameId;
      logger.info("Game started (from block logs)", { gameId: gameId.toString(), txHash });
      return { txHash, gameId };
    }

    const gameId = logs[0].args.gameId;
    logger.info("Game started", { gameId: gameId.toString(), txHash });

    return { txHash, gameId };
  }

  async joinGame(gameId: bigint, stake?: bigint): Promise<`0x${string}`> {
    logger.info("Joining game", { gameId: gameId.toString(), stake: stake?.toString() || "0" });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "joinGame",
      args: [gameId],
      value: stake ?? 0n,
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Joined game", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async cancelGame(gameId: bigint): Promise<`0x${string}`> {
    logger.info("Cancelling game", { gameId: gameId.toString() });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "cancelGame",
      args: [gameId],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Game cancelled", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async claimTimeout(gameId: bigint): Promise<`0x${string}`> {
    logger.info("Claiming timeout", { gameId: gameId.toString() });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "claimTimeout",
      args: [gameId],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Timeout claimed", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async submitMove(
    gameId: bigint,
    encryptedX: `0x${string}` | Uint8Array,
    encryptedY: `0x${string}` | Uint8Array,
    inputProof: `0x${string}` | Uint8Array,
  ): Promise<`0x${string}`> {
    logger.info("Submitting move", { gameId: gameId.toString() });

    // Convert Uint8Arrays to hex if needed
    const xHex = encryptedX instanceof Uint8Array ? toHex(encryptedX) : encryptedX;
    const yHex = encryptedY instanceof Uint8Array ? toHex(encryptedY) : encryptedY;
    const proofHex = inputProof instanceof Uint8Array ? toHex(inputProof) : inputProof;

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "submitMove",
      args: [gameId, xHex, yHex, proofHex],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Move submitted", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async finalizeMove(
    gameId: bigint,
    player: `0x${string}`,
    isInvalid: boolean,
    decryptionProof: `0x${string}`,
  ): Promise<`0x${string}`> {
    logger.info("Finalizing move", { gameId: gameId.toString(), player, isInvalid });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "finalizeMove",
      args: [gameId, player, isInvalid, decryptionProof],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Move finalized", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async finalizeGameState(
    gameId: bigint,
    winner: number,
    collision: boolean,
    decryptionProof: `0x${string}`,
  ): Promise<`0x${string}`> {
    logger.info("Finalizing game state", { gameId: gameId.toString(), winner, collision });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "finalizeGameState",
      args: [gameId, winner, collision, decryptionProof],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Game state finalized", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  async revealBoard(gameId: bigint, board: number[][], decryptionProof: `0x${string}`): Promise<`0x${string}`> {
    logger.info("Revealing board", { gameId: gameId.toString() });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "revealBoard",
      args: [
        gameId,
        board as [
          [number, number, number, number],
          [number, number, number, number],
          [number, number, number, number],
          [number, number, number, number],
        ],
        decryptionProof,
      ],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Board revealed", { gameId: gameId.toString(), txHash });

    return txHash;
  }

  // ============================================================================
  // Transaction Status & Simulation Helpers
  // ============================================================================

  /**
   * Check the status of a transaction by hash
   * Returns the receipt if mined, null if pending/not found
   */
  async getTransactionStatus(txHash: `0x${string}`): Promise<{
    status: "success" | "reverted" | "pending" | "not_found";
    blockNumber?: bigint;
  }> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
      return {
        status: receipt.status === "success" ? "success" : "reverted",
        blockNumber: receipt.blockNumber,
      };
    } catch (error) {
      // Check if transaction exists but not mined yet
      try {
        const tx = await this.publicClient.getTransaction({ hash: txHash });
        if (tx) {
          return { status: "pending" };
        }
      } catch {
        // Transaction not found
      }
      return { status: "not_found" };
    }
  }

  /**
   * Get the current block number
   */
  async getCurrentBlock(): Promise<bigint> {
    return await this.publicClient.getBlockNumber();
  }

  /**
   * Simulate a submitMove call to check if it would succeed
   */
  async simulateSubmitMove(
    gameId: bigint,
    encryptedX: `0x${string}`,
    encryptedY: `0x${string}`,
    inputProof: `0x${string}`,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "submitMove",
        args: [gameId, encryptedX, encryptedY, inputProof],
        account: this.account,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate a finalizeMove call to check if it would succeed
   */
  async simulateFinalizeMove(
    gameId: bigint,
    player: `0x${string}`,
    isInvalid: boolean,
    decryptionProof: `0x${string}`,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeMove",
        args: [gameId, player, isInvalid, decryptionProof],
        account: this.account,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate a finalizeGameState call to check if it would succeed
   */
  async simulateFinalizeGameState(
    gameId: bigint,
    winner: number,
    collision: boolean,
    decryptionProof: `0x${string}`,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "finalizeGameState",
        args: [gameId, winner, collision, decryptionProof],
        account: this.account,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Simulate a revealBoard call to check if it would succeed
   */
  async simulateRevealBoard(
    gameId: bigint,
    board: number[][],
    decryptionProof: `0x${string}`,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.publicClient.simulateContract({
        address: this.contractAddress,
        abi: SIMPHANTOE_ABI,
        functionName: "revealBoard",
        args: [
          gameId,
          board as [
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
            [number, number, number, number],
          ],
          decryptionProof,
        ],
        account: this.account,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Singleton instance
let contractService: ContractService | null = null;

export function getContractService(): ContractService {
  if (!contractService) {
    contractService = new ContractService();
  }
  return contractService;
}
