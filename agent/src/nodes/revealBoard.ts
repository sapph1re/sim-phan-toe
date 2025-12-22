// Reveal board node - decrypts and reveals the final board state

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, Winner, Cell } from "../state.js";

const logger = createLogger("RevealBoard");

export async function revealBoard(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, game, winner, isPlayer1 } = state;

  if (gameId === null || !playerAddress || !game) {
    logger.error("Missing required state for board reveal");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or game data",
    };
  }

  logger.info("Revealing board", { gameId: gameId.toString(), winner });

  try {
    const contract = getContractService();
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    // Step 1: Decrypt all board cells
    logger.debug("Decrypting board...");
    const { board, proof } = await fhe.decryptBoard(game.eBoard);

    logger.debug("Board decrypted", { board });

    // Step 2: Call revealBoard on contract
    logger.debug("Calling revealBoard on contract...");
    await contract.revealBoard(gameId, board, proof);

    // Log the final board
    logBoard(board, isPlayer1);

    // Determine outcome message
    let outcomeMessage: string;
    if (winner === Winner.Draw) {
      outcomeMessage = "Game ended in a DRAW!";
    } else if (
      (winner === Winner.Player1 && isPlayer1) ||
      (winner === Winner.Player2 && !isPlayer1)
    ) {
      outcomeMessage = "🎉 YOU WON! 🎉";
    } else {
      outcomeMessage = "You lost. Better luck next time!";
    }

    logger.info(outcomeMessage);

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
    const row = board[y]
      .map((cell) => ` ${symbols[cell] || "?"} `)
      .join("│");
    console.log(`  │${row}│`);

    if (y < 3) {
      console.log("  ├───┼───┼───┼───┤");
    }
  }

  console.log("  └───┴───┴───┴───┘");
  console.log(`  (You are ${isPlayer1 ? "X" : "O"})\n`);
}

