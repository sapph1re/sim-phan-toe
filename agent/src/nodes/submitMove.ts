// Submit move node - encrypts and submits move to the contract

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase } from "../state.js";

const logger = createLogger("SubmitMove");

export async function submitMove(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, pendingMove, currentRound, myMoves } = state;

  if (gameId === null || !playerAddress || !pendingMove) {
    logger.error("Missing required state for move submission", {
      hasGameId: gameId !== null,
      hasPlayerAddress: !!playerAddress,
      hasPendingMove: !!pendingMove,
    });
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or pending move",
    };
  }

  const { x, y } = pendingMove;
  logger.info("Submitting move", { gameId: gameId.toString(), x, y, round: currentRound });

  try {
    const contract = getContractService();
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    // Step 1: Encrypt the move
    logger.debug("Encrypting move coordinates...");
    const encrypted = await fhe.encryptMove(x, y);
    logger.debug("Move encrypted successfully");

    // Step 2: Submit to contract
    logger.debug("Submitting encrypted move to contract...");
    const txHash = await contract.submitMove(gameId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);

    logger.info("Move submitted successfully", {
      gameId: gameId.toString(),
      x,
      y,
      txHash,
    });

    // Record the move locally (but don't commit until finalized)
    return {
      currentPhase: GamePhase.FinalizingMove,
      lastError: null,
    };
  } catch (error) {
    logger.error("Failed to submit move", error);

    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to submit move",
      retryCount: state.retryCount + 1,
    };
  }
}
