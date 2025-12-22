// Finalize move node - decrypts validity and finalizes move on contract

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, ZERO_BYTES32 } from "../state.js";

const logger = createLogger("FinalizeMove");

export async function finalizeMove(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, myMove, pendingMove, currentRound, myMoves } = state;

  if (gameId === null || !playerAddress || !myMove) {
    logger.error("Missing required state for move finalization");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or move data",
    };
  }

  // Check if move is already finalized
  if (myMove.isMade) {
    logger.info("Move already finalized, checking game state");
    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
    };
  }

  // Check if we have the isInvalid handle
  if (myMove.isInvalid === ZERO_BYTES32) {
    logger.warn("No isInvalid handle yet, waiting...");
    return {
      currentPhase: GamePhase.FinalizingMove,
    };
  }

  logger.info("Finalizing move", { gameId: gameId.toString() });

  try {
    const contract = getContractService();
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    // Step 1: Decrypt the isInvalid flag
    logger.debug("Decrypting move validity...");
    const { value: isInvalid, proof } = await fhe.decryptBool(myMove.isInvalid);

    logger.debug("Move validity decrypted", { isInvalid });

    // Step 2: Call finalizeMove on contract
    logger.debug("Calling finalizeMove on contract...");
    await contract.finalizeMove(gameId, playerAddress, isInvalid, proof);

    if (isInvalid) {
      // Move was invalid (tried to play on occupied cell)
      logger.warn("Move was invalid! Need to select a new move.");
      return {
        currentPhase: GamePhase.SelectingMove,
        pendingMove: null,
        lastError: "Move was invalid - cell may have been occupied",
      };
    }

    // Move was valid - commit it to our local history
    logger.info("Move finalized successfully");

    const newMove = pendingMove
      ? { x: pendingMove.x, y: pendingMove.y, round: currentRound }
      : null;

    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
      myMoves: newMove ? [...myMoves, newMove] : myMoves,
      pendingMove: null,
      lastError: null,
    };
  } catch (error) {
    logger.error("Failed to finalize move", error);

    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to finalize move",
      retryCount: state.retryCount + 1,
    };
  }
}

