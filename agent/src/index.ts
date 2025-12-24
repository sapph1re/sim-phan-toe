#!/usr/bin/env node
// SimPhanToe Agent CLI Entry Point

import "dotenv/config";
import { setMaxListeners } from "events";
import { Command } from "commander";
import { createLogger } from "./utils/logger.js";
import { getContractService } from "./services/contract.js";
import { buildGraph } from "./graph.js";
import { createInitialState, GamePhase, Winner } from "./state.js";
import { initializeDatabase, closePool } from "./persistence/db.js";
import { createOrchestrator } from "./orchestrator.js";

// Increase max listeners to prevent warnings during long polling sessions
// This is needed because each HTTP request adds abort signal listeners
setMaxListeners(100);

const logger = createLogger("CLI");

// Create the CLI program
const program = new Command();

program.name("simphantoe-agent").description("AI agent for playing SimPhanToe on Sepolia").version("1.0.0");

// ============================================================================
// NEW: Orchestrator command - the primary way to run the agent
// ============================================================================

program
  .command("orchestrate")
  .description("Run the multi-game orchestrator (recommended: processes all active games)")
  .action(async () => {
    try {
      logger.info("Starting orchestrator mode...");

      // Initialize database
      await initializeDatabase();

      // Create and run orchestrator
      const orchestrator = createOrchestrator();

      // Sync existing games from chain
      await orchestrator.syncGamesFromChain();

      // Handle graceful shutdown
      const shutdown = async () => {
        logger.info("Shutting down...");
        orchestrator.stop();
        await closePool();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Run orchestrator (runs indefinitely)
      await orchestrator.run();
    } catch (error) {
      logger.error("Orchestrator failed", error);
      await closePool();
      process.exit(1);
    }
  });

// ============================================================================
// NEW: Database initialization command
// ============================================================================

program
  .command("db-init")
  .description("Initialize the PostgreSQL database schema (idempotent - safe to run multiple times)")
  .action(async () => {
    try {
      logger.info("Running database initialization (idempotent)...");
      await initializeDatabase();
      logger.info("Database schema is ready!");
      await closePool();
    } catch (error) {
      logger.error("Failed to initialize database", error);
      await closePool();
      process.exit(1);
    }
  });

// ============================================================================
// Legacy single-game commands (kept for backwards compatibility)
// ============================================================================

// Find and join an open game
program
  .command("find-game")
  .description("Find an open game and join it (legacy single-game mode)")
  .action(async () => {
    try {
      logger.info("Looking for open games...");

      const contract = getContractService();
      const openGames = await contract.getOpenGames();

      if (openGames.length === 0) {
        logger.info("No open games found. Use 'create-game' to start a new one.");
        return;
      }

      logger.info(`Found ${openGames.length} open game(s)`, {
        gameIds: openGames.map((id) => id.toString()),
      });

      // Join the first open game
      const gameId = openGames[0];
      logger.info(`Joining game ${gameId}...`);

      await contract.joinGame(gameId);
      logger.info(`Successfully joined game ${gameId}`);

      // Start playing
      await playGame(gameId);
    } catch (error) {
      logger.error("Failed to find/join game", error);
      process.exit(1);
    }
  });

// Join a specific game
program
  .command("join-game <gameId>")
  .description("Join a specific game by ID (legacy single-game mode)")
  .action(async (gameIdStr: string) => {
    try {
      const gameId = BigInt(gameIdStr);
      logger.info(`Joining game ${gameId}...`);

      const contract = getContractService();
      await contract.joinGame(gameId);

      logger.info(`Successfully joined game ${gameId}`);

      // Start playing
      await playGame(gameId);
    } catch (error) {
      logger.error("Failed to join game", error);
      process.exit(1);
    }
  });

// Create a new game
program
  .command("create-game")
  .description("Create a new game and wait for an opponent (legacy single-game mode)")
  .action(async () => {
    try {
      logger.info("Creating new game...");

      const contract = getContractService();
      const { gameId } = await contract.startGame();

      logger.info(`Game created with ID: ${gameId}`);
      logger.info("Waiting for an opponent to join...");

      // Start playing (will wait for opponent)
      await playGame(gameId);
    } catch (error) {
      logger.error("Failed to create game", error);
      process.exit(1);
    }
  });

// Resume playing an existing game
program
  .command("play <gameId>")
  .description("Resume playing an existing game (legacy single-game mode)")
  .action(async (gameIdStr: string) => {
    try {
      const gameId = BigInt(gameIdStr);
      logger.info(`Resuming game ${gameId}...`);

      await playGame(gameId);
    } catch (error) {
      logger.error("Failed to play game", error);
      process.exit(1);
    }
  });

// List games for the agent's address
program
  .command("list-games")
  .description("List all games for this agent")
  .action(async () => {
    try {
      const contract = getContractService();
      const playerAddress = contract.address;

      logger.info(`Fetching games for ${playerAddress}...`);

      const gameIds = await contract.getGamesByPlayer(playerAddress);

      if (gameIds.length === 0) {
        logger.info("No games found for this address.");
        return;
      }

      logger.info(`Found ${gameIds.length} game(s):`);

      for (const gameId of gameIds) {
        const game = await contract.getGame(gameId);
        const isPlayer1 = game.player1.toLowerCase() === playerAddress.toLowerCase();

        const status =
          game.winner !== Winner.None
            ? `Finished (Winner: ${Winner[game.winner]})`
            : game.player2 === "0x0000000000000000000000000000000000000000"
              ? "Waiting for opponent"
              : "In progress";

        console.log(`  Game ${gameId}: ${status} (You are Player ${isPlayer1 ? "1" : "2"})`);
      }
    } catch (error) {
      logger.error("Failed to list games", error);
      process.exit(1);
    }
  });

// Resume an active game (auto-detect)
program
  .command("resume")
  .description("Resume playing an active game (auto-detects which game to continue)")
  .action(async () => {
    try {
      const contract = getContractService();
      const playerAddress = contract.address;

      logger.info("Checking for active games...");

      const gameIds = await contract.getGamesByPlayer(playerAddress);

      if (gameIds.length === 0) {
        logger.info("No games found. Use 'create-game' to start a new one.");
        return;
      }

      // Categorize games
      const activeGames: { gameId: bigint; status: string; priority: number }[] = [];

      for (const gameId of gameIds) {
        const game = await contract.getGame(gameId);

        if (game.winner !== Winner.None) {
          // Game is finished, skip
          continue;
        }

        const isWaitingForOpponent = game.player2 === "0x0000000000000000000000000000000000000000";

        if (isWaitingForOpponent) {
          activeGames.push({
            gameId,
            status: "Waiting for opponent",
            priority: 1, // Lower priority than in-progress games
          });
        } else {
          activeGames.push({
            gameId,
            status: "In progress",
            priority: 2, // Higher priority
          });
        }
      }

      if (activeGames.length === 0) {
        logger.info("No active games found. All games are finished.");
        logger.info("Use 'create-game' to start a new one or 'find-game' to join one.");
        return;
      }

      // Sort by priority (in-progress first)
      activeGames.sort((a, b) => b.priority - a.priority);

      logger.info(`Found ${activeGames.length} active game(s):`);
      for (const game of activeGames) {
        console.log(`  Game ${game.gameId}: ${game.status}`);
      }

      // Pick the highest priority game
      const selectedGame = activeGames[0];
      logger.info(`Resuming game ${selectedGame.gameId} (${selectedGame.status})...`);

      await playGame(selectedGame.gameId);
    } catch (error) {
      logger.error("Failed to resume game", error);
      process.exit(1);
    }
  });

// Auto mode: resume active game or create new one
program
  .command("auto")
  .description("Automatically resume an active game, or create a new one if none exist (legacy)")
  .action(async () => {
    try {
      const contract = getContractService();
      const playerAddress = contract.address;

      logger.info("Auto mode: checking for active games...");

      const gameIds = await contract.getGamesByPlayer(playerAddress);

      // Find active games
      let activeGameId: bigint | null = null;
      let activeGameStatus: string = "";

      for (const gameId of gameIds) {
        const game = await contract.getGame(gameId);

        if (game.winner !== Winner.None) {
          continue; // Skip finished games
        }

        const isWaitingForOpponent = game.player2 === "0x0000000000000000000000000000000000000000";

        // Prefer in-progress games over waiting games
        if (!isWaitingForOpponent) {
          activeGameId = gameId;
          activeGameStatus = "In progress";
          break; // In-progress game takes priority
        } else if (activeGameId === null) {
          activeGameId = gameId;
          activeGameStatus = "Waiting for opponent";
        }
      }

      if (activeGameId !== null) {
        logger.info(`Found active game ${activeGameId} (${activeGameStatus})`);
        logger.info("Resuming game...");
        await playGame(activeGameId);
      } else {
        logger.info("No active games found. Creating a new game...");
        const { gameId } = await contract.startGame();
        logger.info(`Game created with ID: ${gameId}`);
        logger.info("Waiting for an opponent to join...");
        await playGame(gameId);
      }
    } catch (error) {
      logger.error("Failed in auto mode", error);
      process.exit(1);
    }
  });

// Check game status
program
  .command("status <gameId>")
  .description("Check the status of a specific game")
  .action(async (gameIdStr: string) => {
    try {
      const gameId = BigInt(gameIdStr);
      const contract = getContractService();

      const game = await contract.getGame(gameId);
      const [move1, move2] = await contract.getMoves(gameId);

      const playerAddress = contract.address;
      const isPlayer1 = game.player1.toLowerCase() === playerAddress.toLowerCase();
      const isPlayer2 = game.player2.toLowerCase() === playerAddress.toLowerCase();

      console.log(`\nGame ${gameId} Status:`);
      console.log(`  Player 1: ${game.player1}${isPlayer1 ? " (YOU)" : ""}`);
      console.log(`  Player 2: ${game.player2}${isPlayer2 ? " (YOU)" : ""}`);
      console.log(`  Winner: ${Winner[game.winner] || "None"}`);
      console.log(`\n  Move 1: submitted=${move1.isSubmitted}, made=${move1.isMade}`);
      console.log(`  Move 2: submitted=${move2.isSubmitted}, made=${move2.isMade}`);

      if (game.winner !== Winner.None) {
        // Show revealed board if available
        const hasBoard = game.board.some((row) => row.some((cell) => cell !== 0));
        if (hasBoard) {
          console.log("\n  Board:");
          for (let y = 0; y < 4; y++) {
            const row = game.board[y].map((c) => (c === 0 ? "·" : c === 1 ? "X" : "O")).join(" ");
            console.log(`    ${row}`);
          }
        }
      }
    } catch (error) {
      logger.error("Failed to get game status", error);
      process.exit(1);
    }
  });

// Show wallet address
program
  .command("wallet")
  .description("Show the agent's wallet address")
  .action(async () => {
    try {
      const contract = getContractService();
      const address = contract.address;

      console.log("\n🔑 Agent Wallet");
      console.log(`  Address: ${address}`);
      console.log(`  Network: Sepolia (Chain ID: 11155111)`);
      console.log(`\n  View on Etherscan: https://sepolia.etherscan.io/address/${address}`);
    } catch (error) {
      logger.error("Failed to get wallet info", error);
      process.exit(1);
    }
  });

// Check ETH balance
program
  .command("balance")
  .description("Check the agent's ETH balance on Sepolia")
  .action(async () => {
    try {
      const contract = getContractService();
      const address = contract.address;
      const balance = await contract.getBalance();
      const balanceFormatted = await contract.getBalanceFormatted();

      console.log("\n💰 Agent Balance");
      console.log(`  Address: ${address}`);
      console.log(`  Balance: ${balanceFormatted}`);
      console.log(`  Wei:     ${balance.toString()}`);

      // Warn if balance is low
      const ethBalance = Number(balance) / 1e18;
      if (ethBalance < 0.01) {
        console.log("\n  ⚠️  Warning: Balance is low! You may need more Sepolia ETH for gas.");
        console.log("     Get free Sepolia ETH from: https://sepoliafaucet.com/");
      } else if (ethBalance < 0.05) {
        console.log("\n  ℹ️  Tip: Consider topping up your balance for extended gameplay.");
      }
    } catch (error) {
      logger.error("Failed to get balance", error);
      process.exit(1);
    }
  });

// Main play function (legacy single-game mode)
async function playGame(gameId: bigint): Promise<void> {
  const contract = getContractService();
  const playerAddress = contract.address;

  logger.info(`Starting agent for game ${gameId}`, { playerAddress });

  // Build the graph
  const graph = buildGraph();

  // Create initial state
  const initialState = createInitialState(playerAddress);
  initialState.gameId = gameId;

  logger.info("Agent started, entering game loop...");

  // Run the graph with high recursion limit
  // Games can take a long time (waiting for opponent, multiple rounds, etc.)
  // Each polling cycle counts as graph iterations, so we need a high limit
  // At 5 second polling, 10000 iterations = ~14 hours max
  try {
    const finalState = await graph.invoke(initialState, {
      recursionLimit: 10000,
    });

    // Log final result
    if (finalState.currentPhase === GamePhase.GameComplete) {
      const winnerStr = Winner[finalState.winner];
      const isPlayer1 = finalState.isPlayer1;
      const weWon =
        (finalState.winner === Winner.Player1 && isPlayer1) || (finalState.winner === Winner.Player2 && !isPlayer1);

      if (finalState.winner === Winner.Draw) {
        logger.info("Game ended in a draw!");
      } else if (weWon) {
        logger.info("🎉 We won the game! 🎉");
      } else {
        logger.info(`Game over. ${winnerStr} won.`);
      }
    } else if (finalState.currentPhase === GamePhase.Error) {
      logger.error("Game ended with error", { error: finalState.lastError });
    }
  } catch (error) {
    logger.error("Agent crashed", error);
    throw error;
  }
}

// Parse and run
program.parse();
