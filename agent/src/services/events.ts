// Hybrid event service: WebSocket subscriptions with polling fallback
// Watches for contract events and notifies the orchestrator

import {
  createPublicClient,
  http,
  webSocket,
  keccak256,
  toBytes,
  type PublicClient,
  type WatchContractEventReturnType,
} from "viem";
import { sepolia } from "viem/chains";
import { createLogger } from "../utils/logger.js";
import { SIMPHANTOE_ABI } from "./contract.js";
import * as gameStore from "../persistence/gameStore.js";

const logger = createLogger("Events");

// Event types we care about
export type GameEventName =
  | "GameStarted"
  | "PlayerJoined"
  | "MoveSubmitted"
  | "MoveInvalid"
  | "MoveMade"
  | "MovesProcessed"
  | "Collision"
  | "GameUpdated"
  | "BoardRevealed"
  | "GameCancelled"
  | "GameTimeout";

// Callback type for event notifications
export type EventCallback = (gameId: bigint, eventName: GameEventName, data?: unknown) => void | Promise<void>;

export class EventService {
  private contractAddress: `0x${string}`;
  private chainId: number;
  private rpcUrl: string;
  private wsUrl: string | null;

  private publicClient: PublicClient | null = null;
  private wsClient: PublicClient | null = null;
  private unwatchFns: WatchContractEventReturnType[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private isWsConnected = false;
  private lastPolledBlock: bigint = 0n;

  private callback: EventCallback | null = null;

  constructor(contractAddress: `0x${string}`, chainId: number = 11155111) {
    this.contractAddress = contractAddress;
    this.chainId = chainId;

    const rpcUrl = process.env.SEPOLIA_RPC_URL;
    if (!rpcUrl) {
      throw new Error("SEPOLIA_RPC_URL environment variable is required");
    }
    this.rpcUrl = rpcUrl;

    // Try to derive WebSocket URL from RPC URL
    this.wsUrl = process.env.SEPOLIA_WS_URL || this.deriveWsUrl(rpcUrl);

    // Create HTTP client for polling fallback
    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    });
  }

  private deriveWsUrl(rpcUrl: string): string | null {
    // Try to convert HTTP URL to WebSocket URL
    if (rpcUrl.startsWith("https://")) {
      return rpcUrl.replace("https://", "wss://");
    } else if (rpcUrl.startsWith("http://")) {
      return rpcUrl.replace("http://", "ws://");
    }
    return null;
  }

  /**
   * Start watching for events
   * Tries WebSocket first, falls back to polling
   */
  async startWatching(callback: EventCallback): Promise<void> {
    this.callback = callback;

    logger.info("Starting event watching...");

    // Initialize last polled block
    if (this.publicClient) {
      this.lastPolledBlock = await this.publicClient.getBlockNumber();
    }

    // Try WebSocket connection first
    if (this.wsUrl) {
      try {
        await this.startWebSocketWatching();
        return;
      } catch (error) {
        logger.warn("WebSocket connection failed, falling back to polling", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fall back to polling
    this.startPolling();
  }

  /**
   * Stop watching for events
   */
  async stopWatching(): Promise<void> {
    logger.info("Stopping event watching...");

    // Stop WebSocket watchers
    for (const unwatch of this.unwatchFns) {
      unwatch();
    }
    this.unwatchFns = [];

    // Stop polling
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.isWsConnected = false;
    this.callback = null;
  }

  /**
   * Start WebSocket event subscriptions
   */
  private async startWebSocketWatching(): Promise<void> {
    if (!this.wsUrl) {
      throw new Error("No WebSocket URL available");
    }

    logger.info("Attempting WebSocket connection...", { wsUrl: this.wsUrl.substring(0, 30) + "..." });

    // Create WebSocket client
    this.wsClient = createPublicClient({
      chain: sepolia,
      transport: webSocket(this.wsUrl, {
        reconnect: {
          attempts: 3,
          delay: 1000,
        },
      }),
    });

    // Watch for all relevant events
    const eventNames: GameEventName[] = [
      "GameStarted",
      "PlayerJoined",
      "MoveSubmitted",
      "MoveInvalid",
      "MoveMade",
      "MovesProcessed",
      "Collision",
      "GameUpdated",
      "BoardRevealed",
      "GameCancelled",
      "GameTimeout",
    ];

    for (const eventName of eventNames) {
      const unwatch = this.wsClient.watchContractEvent({
        address: this.contractAddress,
        abi: SIMPHANTOE_ABI,
        eventName,
        onLogs: (logs) => this.handleLogs(logs, eventName),
        onError: (error) => {
          logger.error(`WebSocket error for ${eventName}`, error);
          this.handleWsDisconnect();
        },
      });
      this.unwatchFns.push(unwatch);
    }

    this.isWsConnected = true;
    logger.info("WebSocket event watching started successfully");
  }

  /**
   * Handle WebSocket disconnection - fall back to polling
   */
  private handleWsDisconnect(): void {
    if (!this.isWsConnected) return;

    logger.warn("WebSocket disconnected, falling back to polling");
    this.isWsConnected = false;

    // Clean up WebSocket watchers
    for (const unwatch of this.unwatchFns) {
      try {
        unwatch();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.unwatchFns = [];

    // Start polling
    this.startPolling();
  }

  /**
   * Start polling for events (fallback)
   */
  private startPolling(): void {
    if (this.pollInterval) {
      return; // Already polling
    }

    logger.info("Starting event polling fallback");

    // Poll every 30 seconds - reduced from 10s to minimize RPC usage
    // WebSocket should be the primary method; polling is fallback
    const POLL_INTERVAL_MS = 30000;

    this.pollInterval = setInterval(async () => {
      await this.pollForEvents();
    }, POLL_INTERVAL_MS);

    // Do an immediate poll
    this.pollForEvents();
  }

  /**
   * Poll for new events since last check
   * OPTIMIZED: Uses a single getLogs call with no event filter to fetch ALL events
   * Then filters client-side. This reduces RPC calls from 11 to 2 per poll cycle.
   */
  private async pollForEvents(): Promise<void> {
    if (!this.publicClient) return;

    try {
      const currentBlock = await this.publicClient.getBlockNumber();

      if (currentBlock <= this.lastPolledBlock) {
        return; // No new blocks
      }

      logger.debug("Polling for events", {
        fromBlock: this.lastPolledBlock.toString(),
        toBlock: currentBlock.toString(),
      });

      // OPTIMIZATION: Single getLogs call for ALL contract events instead of 10 separate calls
      // This reduces RPC usage by ~90% for event polling
      try {
        const logs = await this.publicClient.getLogs({
          address: this.contractAddress,
          fromBlock: this.lastPolledBlock + 1n,
          toBlock: currentBlock,
        });

        // Process all logs and extract gameId from indexed topic
        for (const log of logs) {
          // The first topic is the event signature, second topic (if indexed) is gameId
          // All our events have gameId as the first indexed parameter
          if (log.topics.length >= 2 && log.topics[1]) {
            try {
              // Decode gameId from the indexed topic (padded to 32 bytes)
              const gameId = BigInt(log.topics[1]);

              // Determine event name from topic[0] (event signature hash)
              const eventName = this.getEventNameFromSignature(log.topics[0]);
              if (eventName) {
                await this.notifyCallback(gameId, eventName);
              }
            } catch (parseError) {
              logger.debug("Failed to parse log", {
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
            }
          }
        }
      } catch (error) {
        logger.warn("Failed to poll contract events", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      this.lastPolledBlock = currentBlock;
    } catch (error) {
      logger.error("Error polling for events", error);
    }
  }

  /**
   * Map event signature hash to event name
   * Pre-computed keccak256 hashes of event signatures
   */
  private getEventNameFromSignature(signature: `0x${string}` | undefined): GameEventName | null {
    if (!signature) return null;

    // Event signature hashes (keccak256 of "EventName(type1,type2,...)")
    const signatureMap: Record<string, GameEventName> = {
      // GameStarted(uint256 indexed gameId, address indexed player1, uint256 stake, uint256 moveTimeout)
      "0x0f9f3de0f0f9f3de0f0f9f3de0": "GameStarted", // Placeholder - computed below
      // PlayerJoined(uint256 indexed gameId, address indexed player2)
      // MoveSubmitted(uint256 indexed gameId, address indexed player)
      // etc.
    };

    // Lazily compute signature hashes on first use
    if (!this.eventSignatures) {
      this.eventSignatures = this.computeEventSignatures();
    }

    return this.eventSignatures.get(signature.toLowerCase()) || null;
  }

  private eventSignatures: Map<string, GameEventName> | null = null;

  /**
   * Compute keccak256 hashes of event signatures
   */
  private computeEventSignatures(): Map<string, GameEventName> {
    const eventSigs: [string, GameEventName][] = [
      ["GameStarted(uint256,address,uint256,uint256)", "GameStarted"],
      ["PlayerJoined(uint256,address)", "PlayerJoined"],
      ["MoveSubmitted(uint256,address)", "MoveSubmitted"],
      ["MoveInvalid(uint256,address)", "MoveInvalid"],
      ["MoveMade(uint256,address)", "MoveMade"],
      ["MovesProcessed(uint256)", "MovesProcessed"],
      ["Collision(uint256)", "Collision"],
      ["GameUpdated(uint256,uint8)", "GameUpdated"],
      ["BoardRevealed(uint256)", "BoardRevealed"],
      ["GameCancelled(uint256)", "GameCancelled"],
      ["GameTimeout(uint256,address)", "GameTimeout"],
    ];

    const map = new Map<string, GameEventName>();
    for (const [sig, name] of eventSigs) {
      const hash = keccak256(toBytes(sig));
      map.set(hash.toLowerCase(), name);
    }
    return map;
  }

  /**
   * Handle incoming logs from WebSocket
   */
  private handleLogs(logs: unknown[], eventName: GameEventName): void {
    for (const log of logs) {
      const typedLog = log as { args?: { gameId?: bigint } };
      if (typedLog.args?.gameId !== undefined) {
        this.notifyCallback(typedLog.args.gameId, eventName);
      }
    }
  }

  /**
   * Notify the callback of an event
   */
  private async notifyCallback(gameId: bigint, eventName: GameEventName): Promise<void> {
    if (!this.callback) return;

    logger.debug("Event received", { gameId: gameId.toString(), eventName });

    try {
      await this.callback(gameId, eventName);
    } catch (error) {
      logger.error("Error in event callback", error, {
        gameId: gameId.toString(),
        eventName,
      });
    }
  }

  /**
   * Check if currently using WebSocket (vs polling)
   */
  isUsingWebSocket(): boolean {
    return this.isWsConnected;
  }
}

// Factory function
export function createEventService(contractAddress: `0x${string}`, chainId?: number): EventService {
  return new EventService(contractAddress, chainId);
}
