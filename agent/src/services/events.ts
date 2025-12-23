// Hybrid event service: WebSocket subscriptions with polling fallback
// Watches for contract events and notifies the orchestrator

import { createPublicClient, http, webSocket, type PublicClient, type WatchContractEventReturnType } from "viem";
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
  | "BoardRevealed";

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
    
    // Poll every 10 seconds
    const POLL_INTERVAL_MS = 10000;
    
    this.pollInterval = setInterval(async () => {
      await this.pollForEvents();
    }, POLL_INTERVAL_MS);
    
    // Do an immediate poll
    this.pollForEvents();
  }

  /**
   * Poll for new events since last check
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

      // Get all event types
      const eventConfigs = [
        { name: "GameStarted" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "PlayerJoined" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "MoveSubmitted" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "MoveMade" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "MovesProcessed" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "Collision" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "GameUpdated" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
        { name: "BoardRevealed" as const, filter: { name: "gameId" as const, type: "uint256" as const, indexed: true } },
      ];

      for (const config of eventConfigs) {
        try {
          const logs = await this.publicClient.getLogs({
            address: this.contractAddress,
            event: {
              type: "event",
              name: config.name,
              inputs: [
                { name: "gameId", type: "uint256", indexed: true },
                // Other inputs vary by event but we only need gameId
              ],
            },
            fromBlock: this.lastPolledBlock + 1n,
            toBlock: currentBlock,
          });

          for (const log of logs) {
            // Type assertion needed due to dynamic event configuration
            const args = log.args as { gameId?: bigint };
            if (args.gameId !== undefined) {
              await this.notifyCallback(args.gameId, config.name);
            }
          }
        } catch (error) {
          // Some events might fail to parse, continue with others
          logger.debug(`Failed to poll ${config.name} events`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.lastPolledBlock = currentBlock;
    } catch (error) {
      logger.error("Error polling for events", error);
    }
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

