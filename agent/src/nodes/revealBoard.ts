// Reveal board node - decrypts and reveals the final board state
// With idempotency checks and persistence

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, Winner, Cell } from "../state.js";
import * as gameStore from "../persistence/gameStore.js";
import { createGameKey } from "../persistence/gameStore.js";

const logger = createLogger("RevealBoard");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

export async function revealBoard(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, game, winner, isPlayer1 } = state;

  if (gameId === null || !playerAddress || !game) {
    logger.error("Missing required state for board reveal");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or game data",
    };
  }

  const contract = getContractService();
  const gameKey = createGameKey(CHAIN_ID, contract.simphantoeAddress, gameId);

  // =========================================================================
  // 1. Precondition check: is board already revealed?
  // =========================================================================
  const currentGame = await contract.getGame(gameId);
  const boardRevealed = currentGame.board.some((row) => row.some((cell) => cell !== 0));

  if (boardRevealed) {
    logger.info("Board already revealed on-chain");
    logBoard(currentGame.board as number[][], isPlayer1);
    
    // Log final outcome
    logOutcome(winner, isPlayer1);

    // Mark game as completed in DB
    await gameStore.updateGame(gameKey, { status: "completed" });

    return {
      currentPhase: GamePhase.GameComplete,
      shouldContinue: false,
      lastError: null,
      game: currentGame,
    };
  }

  logger.info("Revealing board", { gameId: gameId.toString(), winner });

  try {
    // =========================================================================
    // 2. Check existing tx marker for pending transaction
    // =========================================================================
    const marker = await gameStore.getTxMarker(gameKey, "revealBoard");

    if (marker?.tx_status === "pending" && marker.tx_hash) {
      logger.info("Found pending revealBoard transaction, checking status...", {
        txHash: marker.tx_hash,
      });

      const txStatus = await contract.getTransactionStatus(marker.tx_hash as `0x${string}`);

      if (txStatus.status === "success") {
        logger.info("Previous revealBoard transaction succeeded");
        await gameStore.updateTxMarker(gameKey, "revealBoard", { txStatus: "confirmed" });
        
        // Re-fetch and display the revealed board
        const updatedGame = await contract.getGame(gameId);
        logBoard(updatedGame.board as number[][], isPlayer1);
        logOutcome(winner, isPlayer1);

        await gameStore.updateGame(gameKey, { status: "completed" });

        return {
          currentPhase: GamePhase.GameComplete,
          shouldContinue: false,
          lastError: null,
          game: updatedGame,
        };
      } else if (txStatus.status === "reverted") {
        logger.warn("Previous revealBoard transaction reverted, retrying...");
        await gameStore.clearTxMarker(gameKey, "revealBoard");
      } else if (txStatus.status === "pending") {
        logger.info("Previous revealBoard transaction still pending, waiting...");
        return {
          currentPhase: GamePhase.RevealingBoard,
        };
      } else {
        logger.warn("Previous revealBoard transaction not found (dropped?), retrying...");
        await gameStore.clearTxMarker(gameKey, "revealBoard");
      }
    }

    // =========================================================================
    // 3. Decrypt the board and call revealBoard
    // =========================================================================
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    logger.debug("Decrypting board...");
    const { board, proof } = await fhe.decryptBoard(game.eBoard);

    logger.debug("Board decrypted");

    logger.debug("Calling revealBoard on contract...");
    const txHash = await contract.revealBoard(gameId, board, proof);

    // =========================================================================
    // 4. Store tx marker and mark game complete
    // =========================================================================
    await gameStore.setTxMarker(gameKey, "revealBoard", {
      txHash,
      txStatus: "confirmed",
    });

    await gameStore.updateGame(gameKey, { status: "completed" });

    // =========================================================================
    // 5. Log the final board and outcome
    // =========================================================================
    logBoard(board, isPlayer1);
    logOutcome(winner, isPlayer1);

    return {
      currentPhase: GamePhase.GameComplete,
      shouldContinue: false,
      lastError: null,
    };
  } catch (error) {
    logger.error("Failed to reveal board", error);

    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to reveal board",
      retryCount: state.retryCount + 1,
    };
  }
}

// Helper to log the board in a nice format
function logBoard(board: number[][], isPlayer1: boolean): void {
  const symbols: Record<number, string> = {
    [Cell.Empty]: "·",
    [Cell.Player1]: isPlayer1 ? "X" : "O",
    [Cell.Player2]: isPlayer1 ? "O" : "X",
  };

  console.log("\n  Final Board:");
  console.log("  ┌───┬───┬───┬───┐");

  for (let y = 0; y < 4; y++) {
    const row = board[y].map((cell) => ` ${symbols[cell] || "?"} `).join("│");
    console.log(`  │${row}│`);

    if (y < 3) {
      console.log("  ├───┼───┼───┼───┤");
    }
  }

  console.log("  └───┴───┴───┴───┘");
  console.log(`  (You are ${isPlayer1 ? "X" : "O"})\n`);
}

// Helper to log the game outcome
function logOutcome(winner: Winner, isPlayer1: boolean): void {
  let outcomeMessage: string;
  if (winner === Winner.Draw) {
    outcomeMessage = "Game ended in a DRAW!";
  } else if ((winner === Winner.Player1 && isPlayer1) || (winner === Winner.Player2 && !isPlayer1)) {
    outcomeMessage = "🎉 YOU WON! 🎉";
  } else {
    outcomeMessage = "You lost. Better luck next time!";
  }

  logger.info(outcomeMessage);
}
