// Finalize game state node - decrypts winner/collision and resolves the round

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, Winner, ZERO_BYTES32 } from "../state.js";

const logger = createLogger("FinalizeGameState");

export async function finalizeGameState(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, game, currentRound } = state;

  if (gameId === null || !playerAddress || !game) {
    logger.error("Missing required state for game finalization");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or game data",
    };
  }

  // Check if we have the handles to decrypt
  if (game.eWinner === ZERO_BYTES32) {
    logger.warn("No winner handle yet, checking game state");
    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
    };
  }

  logger.info("Finalizing game state", { gameId: gameId.toString() });

  try {
    const contract = getContractService();
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    // Step 1: Decrypt winner and collision
    logger.debug("Decrypting game state...");
    const { winner, collision, proof } = await fhe.decryptGameState(game.eWinner, game.eCollision);

    logger.info("Game state decrypted", { winner, collision });

    // Step 2: Call finalizeGameState on contract
    logger.debug("Calling finalizeGameState on contract...");
    await contract.finalizeGameState(gameId, winner, collision, proof);

    // Handle the result
    if (collision) {
      logger.info("Collision occurred! Both players chose the same cell.");
      return {
        currentPhase: GamePhase.SelectingMove,
        collisionOccurred: true,
        // Don't increment round on collision - we're replaying
        lastError: null,
      };
    }

    if (winner !== Winner.None) {
      logger.info("Game has a winner!", { winner });
      return {
        currentPhase: GamePhase.RevealingBoard,
        winner: winner as Winner,
        currentRound: currentRound + 1,
        lastError: null,
      };
    }

    // No winner yet, continue to next round
    logger.info("Round complete, no winner yet");
    return {
      currentPhase: GamePhase.SelectingMove,
      currentRound: currentRound + 1,
      collisionOccurred: false,
      lastError: null,
    };
  } catch (error) {
    logger.error("Failed to finalize game state", error);

    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to finalize game state",
      retryCount: state.retryCount + 1,
    };
  }
}
