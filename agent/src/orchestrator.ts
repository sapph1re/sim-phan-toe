// Multi-game orchestrator with round-robin processing and auto-open-game
// Processes all active games, maintaining exactly one open game for new opponents

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

export class GameOrchestrator {
  private contractAddress: `0x${string}`;
  private playerAddress: `0x${string}`;
  private eventService: EventService;
  private graph: CompiledGraph;
  private isRunning = false;

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
   * Run one orchestration cycle
   */
  private async runOrchestrationCycle(): Promise<void> {
    // 1. Ensure we have exactly one open game waiting for opponents
    await this.ensureOpenGame();

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
   * Ensure we have exactly one open game waiting for opponents
   */
  private async ensureOpenGame(): Promise<void> {
    const openGames = await gameStore.getGamesWaitingForOpponent(CHAIN_ID, this.contractAddress);

    if (openGames.length === 0) {
      logger.info("No open game found, creating one for new players...");

      try {
        const contract = getContractService();
        const { gameId, txHash } = await contract.startGame();

        // Create game record in DB
        const gameKey = createGameKey(CHAIN_ID, this.contractAddress, gameId);
        await gameStore.createGame(gameKey, {
          playerAddress: this.playerAddress,
          isPlayer1: true,
          currentPhase: GamePhase.WaitingForOpponent,
          status: "active",
          nextCheckAt: new Date(Date.now() + 20_000), // Check in 20s
        });

        logger.info("Created open game", { gameId: gameId.toString(), txHash });
      } catch (error) {
        logger.error("Failed to create open game", error);
        // Don't throw - we'll try again next cycle
      }
    } else if (openGames.length > 1) {
      logger.warn("Multiple open games found", { count: openGames.length });
      // This shouldn't happen, but we'll just let them be
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
      const daysSinceActivity =
        (Date.now() - game.last_opponent_activity.getTime()) / (24 * 60 * 60 * 1000);

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
    try {
      const newState = await this.graph.invoke(state, {
        recursionLimit: 1,
      });

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
        continue; // Already tracked
      }

      // Fetch game data from chain
      const gameData = await contract.getGame(gameId);
      const isPlayer1 = gameData.player1.toLowerCase() === this.playerAddress.toLowerCase();

      // Determine initial phase
      let currentPhase: GamePhase;
      if (gameData.winner !== Winner.None) {
        currentPhase = GamePhase.GameComplete;
      } else if (gameData.player2 === "0x0000000000000000000000000000000000000000") {
        currentPhase = GamePhase.WaitingForOpponent;
      } else {
        currentPhase = GamePhase.Idle; // Will be determined by checkGameState
      }

      // Create game record
      await gameStore.createGame(gameKey, {
        playerAddress: this.playerAddress,
        isPlayer1,
        currentPhase,
        status: gameData.winner !== Winner.None ? "completed" : "active",
        nextCheckAt: new Date(), // Check immediately
      });

      logger.info("Synced game from chain", {
        gameId: gameId.toString(),
        isPlayer1,
        phase: currentPhase,
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

