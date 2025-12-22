// Contract service for interacting with SimPhanToe on Sepolia

import {
  createPublicClient,
  createWalletClient,
  http,
  getContract,
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

  // Write functions
  async startGame(): Promise<{ txHash: `0x${string}`; gameId: bigint }> {
    logger.info("Starting new game...");

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "startGame",
    });

    logger.debug("Transaction submitted", { txHash });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.debug("Transaction confirmed", { blockNumber: receipt.blockNumber });

    // Parse GameStarted event to get gameId
    const gameStartedLog = receipt.logs.find((log) => {
      try {
        const topics = log.topics;
        // GameStarted event signature
        return topics[0] === "0x7d07a8d39e6f0c2e1b6f6c0ed7c2c1b0a9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4";
      } catch {
        return false;
      }
    });

    // Get the latest game count to determine the new game ID
    const gameCount = await this.getGameCount();
    const gameId = gameCount - 1n;

    logger.info("Game started", { gameId: gameId.toString(), txHash });

    return { txHash, gameId };
  }

  async joinGame(gameId: bigint): Promise<`0x${string}`> {
    logger.info("Joining game", { gameId: gameId.toString() });

    const txHash = await this.walletClient.writeContract({
      account: this.account,
      chain: sepolia,
      address: this.contractAddress,
      abi: SIMPHANTOE_ABI,
      functionName: "joinGame",
      args: [gameId],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    logger.info("Joined game", { gameId: gameId.toString(), txHash });

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
}

// Singleton instance
let contractService: ContractService | null = null;

export function getContractService(): ContractService {
  if (!contractService) {
    contractService = new ContractService();
  }
  return contractService;
}
