// Multi-game orchestrator with round-robin processing and auto-open-game
// Processes all active games, maintaining two open games for new opponents:
// - One free game (no stake)
// - One paid game (0.01 ETH stake) when balance permits

import { createLogger } from "./utils/logger.js";
import { sleep } from "./utils/retry.js";
import { getContractService } from "./services/contract.js";
import { createEventService, type EventService, type GameEventName } from "./services/events.js";
import { buildGraph, type CompiledGraph } from "./graph.js";
import { createInitialState, GamePhase, Winner, type AgentState } from "./state.js";
import * as gameStore from "./persistence/gameStore.js";
import { createGameKey, type GameKey, type GameRecord } from "./persistence/gameStore.js";

const logger = createLogger("Orchestrator");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

// Timing constants
const MAIN_LOOP_DELAY_MS = 1000; // Delay between orchestration cycles
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_MOVE_TIMEOUT = 86400n; // 24 hours in seconds

// Balance thresholds
const LOW_BALANCE_WEI = 50_000_000_000_000_000n; // 0.05 ETH - warning threshold
const MIN_BALANCE_WEI = 10_000_000_000_000_000n; // 0.01 ETH - stop threshold
const BALANCE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const BALANCE_LOG_INTERVAL_MS = 30 * 60 * 1000; // Log every 30 minutes

// Game creation constants
const PAID_GAME_STAKE = 10_000_000_000_000_000n; // 0.01 ETH
const MIN_BALANCE_FOR_PAID_GAME = 15_000_000_000_000_000n; // 0.015 ETH (stake + gas buffer)

export class GameOrchestrator {
  private contractAddress: `0x${string}`;
  private playerAddress: `0x${string}`;
  private eventService: EventService;
  private graph: CompiledGraph;
  private isRunning = false;
  private lastBalanceCheck = 0;
  private lastBalanceLog = 0;

  constructor() {
    const contract = getContractService();
    this.contractAddress = contract.simphantoeAddress;
    this.playerAddress = contract.address;
    this.eventService = createEventService(this.contractAddress, CHAIN_ID);
    this.graph = buildGraph();
  }

  /**
   * Start the orchestrator
   * Runs indefinitely, processing games in round-robin fashion
   */
  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Orchestrator is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting game orchestrator", {
      playerAddress: this.playerAddress,
      contractAddress: this.contractAddress,
    });

    try {
      // Start event watching
      await this.eventService.startWatching(this.onGameEvent.bind(this));
      logger.info("Event watching started", {
        usingWebSocket: this.eventService.isUsingWebSocket(),
      });

      // Main orchestration loop
      while (this.isRunning) {
        try {
          await this.runOrchestrationCycle();
        } catch (error) {
          logger.error("Error in orchestration cycle", error);
          // Continue running despite errors
        }

        await sleep(MAIN_LOOP_DELAY_MS);
      }
    } finally {
      await this.eventService.stopWatching();
      this.isRunning = false;
      logger.info("Orchestrator stopped");
    }
  }

  /**
   * Stop the orchestrator gracefully
   */
  stop(): void {
    logger.info("Stopping orchestrator...");
    this.isRunning = false;
  }

  /**
   * Check ETH balance and log periodically
   * Returns true if balance is sufficient, false if too low to continue
   */
  private async checkBalance(): Promise<boolean> {
    const now = Date.now();

    // Only check every BALANCE_CHECK_INTERVAL_MS to avoid RPC spam
    if (now - this.lastBalanceCheck < BALANCE_CHECK_INTERVAL_MS) {
      return true; // Assume OK if we checked recently
    }

    this.lastBalanceCheck = now;

    try {
      const contract = getContractService();
      const balance = await contract.getBalance();
      const balanceEth = Number(balance) / 1e18;

      // Log balance periodically or if it's low
      const shouldLog =
        now - this.lastBalanceLog >= BALANCE_LOG_INTERVAL_MS || this.lastBalanceLog === 0 || balance < LOW_BALANCE_WEI;

      if (shouldLog) {
        this.lastBalanceLog = now;

        if (balance < MIN_BALANCE_WEI) {
          logger.error("CRITICAL: Balance too low to continue!", {
            balance: `${balanceEth.toFixed(6)} ETH`,
            minimum: "0.01 ETH",
          });
        } else if (balance < LOW_BALANCE_WEI) {
          logger.warn("Low balance warning - consider topping up", {
            balance: `${balanceEth.toFixed(6)} ETH`,
            warning: "< 0.05 ETH",
          });
        } else {
          logger.info("Agent balance", {
            balance: `${balanceEth.toFixed(6)} ETH`,
          });
        }
      }

      // Return false if balance is below minimum threshold
      if (balance < MIN_BALANCE_WEI) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error("Failed to check balance", error);
      // Don't stop on balance check errors - might be temporary RPC issue
      return true;
    }
  }

  /**
   * Run one orchestration cycle
   */
  private async runOrchestrationCycle(): Promise<void> {
    // 0. Check balance - stop if too low
    const hasBalance = await this.checkBalance();
    if (!hasBalance) {
      logger.error("Stopping orchestrator due to insufficient balance");
      this.stop();
      return;
    }

    // 1. Ensure we have open games waiting for opponents (free + paid)
    await this.ensureOpenGames();

    // 2. Get games that need checking now
    const gamesToCheck = await gameStore.getGamesReadyToCheck(CHAIN_ID, this.contractAddress);

    if (gamesToCheck.length === 0) {
      logger.debug("No games ready to check");
      return;
    }

    logger.debug("Processing games", { count: gamesToCheck.length });

    // 3. Process each game (round-robin, one step per game)
    for (const game of gamesToCheck) {
      if (!this.isRunning) break;

      try {
        await this.processGameStep(game);
      } catch (error) {
        logger.error("Error processing game", error, {
          gameId: game.game_id.toString(),
        });

        // Mark game with error but don't stop
        const gameKey = createGameKey(CHAIN_ID, this.contractAddress, game.game_id);
        await gameStore.updateGame(gameKey, {
          lastError: error instanceof Error ? error.message : String(error),
          nextCheckAt: new Date(Date.now() + 60000), // Retry in 1 minute
        });
      }
    }
  }

  /**
   * Check if we have enough balance to create a paid game
   */
  private async hasBalanceForPaidGame(): Promise<boolean> {
    try {
      const contract = getContractService();
      const balance = await contract.getBalance();
      return balance >= MIN_BALANCE_FOR_PAID_GAME;
    } catch (error) {
      logger.error("Failed to check balance for paid game", error);
      return false;
    }
  }

  /**
   * Create a new open game with specified stake
   */
  private async createOpenGame(stake: bigint): Promise<void> {
    const contract = getContractService();
    const stakeEth = Number(stake) / 1e18;

    logger.info("Creating open game", {
      stake: stake === 0n ? "free" : `${stakeEth} ETH`,
    });

    try {
      const { gameId, txHash } = await contract.startGame(DEFAULT_MOVE_TIMEOUT, stake);

      // Create game record in DB with stake cached to avoid future RPC calls
      const gameKey = createGameKey(CHAIN_ID, this.contractAddress, gameId);
      await gameStore.createGame(gameKey, {
        playerAddress: this.playerAddress,
        isPlayer1: true,
        currentPhase: GamePhase.WaitingForOpponent,
        status: "active",
        nextCheckAt: new Date(Date.now() + 20_000), // Check in 20s
        stake: stake, // Cache stake to avoid RPC calls in ensureOpenGames
      });

      logger.info("Created open game", {
        gameId: gameId.toString(),
        txHash,
        stake: stake === 0n ? "free" : `${stakeEth} ETH`,
        timeout: DEFAULT_MOVE_TIMEOUT.toString(),
      });
    } catch (error) {
      logger.error("Failed to create open game", error, {
        stake: stake === 0n ? "free" : `${stakeEth} ETH`,
      });
      // Don't throw - we'll try again next cycle
    }
  }

  /**
   * Ensure we have two open games waiting for opponents:
   * - One free game (stake = 0)
   * - One paid game (stake = 0.01 ETH) if balance permits
   * 
   * OPTIMIZED: Uses cached stake from DB instead of making RPC calls per game.
   * This reduces RPC usage from N calls/second to 0 calls for game categorization.
   */
  private async ensureOpenGames(): Promise<void> {
    const openGames = await gameStore.getGamesWaitingForOpponent(CHAIN_ID, this.contractAddress);

    // Categorize open games by cached stake (no RPC calls!)
    const freeGames: GameRecord[] = [];
    const paidGames: GameRecord[] = [];

    for (const game of openGames) {
      // Use cached stake from DB instead of fetching from chain
      const stake = BigInt(game.stake || "0");
      if (stake === 0n) {
        freeGames.push(game);
      } else {
        paidGames.push(game);
      }
    }

    // Create missing free game
    if (freeGames.length === 0) {
      await this.createOpenGame(0n);
    }

    // Create missing paid game if balance permits
    if (paidGames.length === 0) {
      const canCreatePaid = await this.hasBalanceForPaidGame();
      if (canCreatePaid) {
        await this.createOpenGame(PAID_GAME_STAKE);
      } else {
        logger.debug("Skipping paid game creation - insufficient balance");
      }
    }
  }

  /**
   * Process one step of a game
   */
  private async processGameStep(game: GameRecord): Promise<void> {
    const gameKey = createGameKey(CHAIN_ID, this.contractAddress, game.game_id);

    logger.debug("Processing game step", {
      gameId: game.game_id.toString(),
      phase: game.current_phase,
    });

    // Check for 3-day abandonment (only for games with an opponent who stopped playing)
    if (game.current_phase === GamePhase.WaitingForOpponentMove && game.last_opponent_activity) {
      const daysSinceActivity = (Date.now() - game.last_opponent_activity.getTime()) / (24 * 60 * 60 * 1000);

      if (daysSinceActivity >= 3) {
        logger.info("Abandoning game - opponent inactive for 3+ days", {
          gameId: game.game_id.toString(),
          daysSinceActivity: daysSinceActivity.toFixed(1),
        });
        await gameStore.updateGame(gameKey, { status: "abandoned" });
        return;
      }
    }

    // Load state from DB
    const savedState = await gameStore.loadGameState(gameKey);

    // Merge with initial state
    const state: AgentState = {
      ...createInitialState(this.playerAddress),
      ...savedState,
      gameId: game.game_id,
      playerAddress: this.playerAddress,
    } as AgentState;

    // Run one step of the graph
    // Higher limit to allow completing one logical action cycle
    // (e.g., checkGameState → selectMove → submitMove → finalizeMove → waitForOpponent → END)
    try {
      const newState = await this.graph.invoke(state, {
        recursionLimit: 25,
      });

      // Handle terminal error states - mark game as errored so we stop processing it
      if (newState.currentPhase === GamePhase.Error) {
        logger.warn("Game entered error state, marking as errored", {
          gameId: game.game_id.toString(),
          error: newState.lastError,
        });
        await gameStore.updateGame(gameKey, {
          status: "errored",
          currentPhase: GamePhase.Error,
          lastError: typeof newState.lastError === "string" ? newState.lastError : JSON.stringify(newState.lastError),
        });
        return;
      }

      // Handle game completion
      if (newState.currentPhase === GamePhase.GameComplete) {
        logger.info("Game completed", {
          gameId: game.game_id.toString(),
          winner: newState.winner,
        });
        await gameStore.updateGame(gameKey, {
          status: "completed",
          currentPhase: GamePhase.GameComplete,
          winner: newState.winner,
        });
        return;
      }

      // Calculate next check time based on phase
      const nextCheckAt = this.calculateNextCheckTime(newState);

      // Save state back to DB
      await gameStore.saveGameState(gameKey, newState, { nextCheckAt });

      logger.debug("Game step completed", {
        gameId: game.game_id.toString(),
        newPhase: newState.currentPhase,
        nextCheck: nextCheckAt.toISOString(),
      });
    } catch (error) {
      logger.error("Graph execution failed", error, {
        gameId: game.game_id.toString(),
      });
      throw error;
    }
  }

  /**
   * Calculate when to check this game next based on its phase
   */
  private calculateNextCheckTime(state: AgentState): Date {
    const now = Date.now();

    switch (state.currentPhase) {
      case GamePhase.WaitingForOpponent:
        // Fixed 20s - people might join anytime, we want to be responsive
        return new Date(now + 20_000);

      case GamePhase.WaitingForOpponentMove:
        // Graduated backoff: 30s -> 5min over time (humans have lives!)
        return this.calculateWaitingForMoveInterval(state.waitingSince);

      case GamePhase.GameComplete:
        // Don't schedule further checks - game is done
        return new Date(now + 365 * 24 * 60 * 60 * 1000); // Far future

      case GamePhase.Error:
        // Retry errors after a delay
        return new Date(now + 60_000); // 1 minute

      default:
        // Active phases (submitting, finalizing, etc.): check quickly
        return new Date(now + 5_000);
    }
  }

  /**
   * Calculate interval for waiting for opponent move
   * Graduated backoff: 30s -> 5min over ~24 hours
   */
  private calculateWaitingForMoveInterval(waitingSince: number | null): Date {
    const now = Date.now();
    const waitingMs = waitingSince ? now - waitingSince : 0;
    const waitingHours = waitingMs / (1000 * 60 * 60);

    // Start at 30s, slowly increase to max 5min over ~24 hours
    const baseInterval = 30_000; // 30 seconds
    const maxInterval = 5 * 60_000; // 5 minutes
    const growthFactor = Math.pow(1.1, waitingHours * 2); // Slow exponential growth
    const interval = Math.min(baseInterval * growthFactor, maxInterval);

    return new Date(now + interval);
  }

  /**
   * Handle incoming game events from WebSocket/polling
   */
  private async onGameEvent(gameId: bigint, eventName: GameEventName): Promise<void> {
    logger.info("Game event received", { gameId: gameId.toString(), eventName });

    const gameKey = createGameKey(CHAIN_ID, this.contractAddress, gameId);

    // Check if this game exists in our DB
    const game = await gameStore.getGame(gameKey);

    if (!game) {
      // New game we don't know about - might be one we just joined or created
      // We'll discover it in the next sync cycle
      logger.debug("Event for unknown game, will be discovered in next cycle", {
        gameId: gameId.toString(),
      });
      return;
    }

    // Build updates
    const updates: Parameters<typeof gameStore.updateGame>[1] = {
      nextCheckAt: new Date(), // Check immediately
    };

    // Track opponent activity for abandonment detection
    if (["PlayerJoined", "MoveSubmitted", "MoveMade", "MovesProcessed"].includes(eventName)) {
      updates.lastOpponentActivity = new Date();
    }

    // Reset waiting timer on certain events
    if (["PlayerJoined", "MovesProcessed", "Collision"].includes(eventName)) {
      updates.waitingSince = null;
    }

    // Handle game-ending events
    if (["GameCancelled", "GameTimeout"].includes(eventName)) {
      updates.status = "completed";
      updates.currentPhase = GamePhase.GameComplete;
    }

    await gameStore.updateGame(gameKey, updates);

    logger.debug("Game updated from event", {
      gameId: gameId.toString(),
      eventName,
    });
  }

  /**
   * Sync games from chain to DB
   * Call this on startup to discover existing games
   */
  async syncGamesFromChain(): Promise<void> {
    logger.info("Syncing games from chain...");

    const contract = getContractService();
    const gameIds = await contract.getGamesByPlayer(this.playerAddress);

    logger.info("Found games on chain", { count: gameIds.length });

    for (const gameId of gameIds) {
      const gameKey = createGameKey(CHAIN_ID, this.contractAddress, gameId);

      // Check if game already exists in DB
      const existingGame = await gameStore.getGame(gameKey);
      if (existingGame) {
        // Update stake if missing (for games created before stake caching)
        if (!existingGame.stake || existingGame.stake === "0") {
          try {
            const gameData = await contract.getGame(gameId);
            if (gameData.stake > 0n) {
              await gameStore.updateGame(gameKey, { stake: gameData.stake });
              logger.debug("Updated cached stake for existing game", {
                gameId: gameId.toString(),
                stake: gameData.stake.toString(),
              });
            }
          } catch (error) {
            logger.warn("Failed to update stake for existing game", {
              gameId: gameId.toString(),
            });
          }
        }
        continue; // Already tracked
      }

      // Fetch game data from chain
      const gameData = await contract.getGame(gameId);
      const isPlayer1 = gameData.player1.toLowerCase() === this.playerAddress.toLowerCase();

      // Determine initial phase and status
      let currentPhase: GamePhase;
      let status: "active" | "completed" | "abandoned" | "errored" = "active";

      if (gameData.winner !== Winner.None) {
        currentPhase = GamePhase.GameComplete;
        status = "completed";
      } else if (gameData.player2 === "0x0000000000000000000000000000000000000000") {
        currentPhase = GamePhase.WaitingForOpponent;
      } else {
        currentPhase = GamePhase.Idle; // Will be determined by checkGameState
      }

      // Create game record with cached stake
      await gameStore.createGame(gameKey, {
        playerAddress: this.playerAddress,
        isPlayer1,
        currentPhase,
        status,
        nextCheckAt: new Date(), // Check immediately
        stake: gameData.stake, // Cache stake to avoid future RPC calls
      });

      logger.info("Synced game from chain", {
        gameId: gameId.toString(),
        isPlayer1,
        phase: currentPhase,
        stake: gameData.stake.toString(),
      });
    }

    logger.info("Game sync complete");
  }
}

/**
 * Create and return a new orchestrator instance
 */
export function createOrchestrator(): GameOrchestrator {
  return new GameOrchestrator();
}
