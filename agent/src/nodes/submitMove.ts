// Submit move node - encrypts and submits move to the contract
// With idempotency checks and persistence

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase } from "../state.js";
import * as gameStore from "../persistence/gameStore.js";
import { createGameKey } from "../persistence/gameStore.js";

const logger = createLogger("SubmitMove");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

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

  const contract = getContractService();
  const gameKey = createGameKey(CHAIN_ID, contract.simphantoeAddress, gameId);
  const { x, y } = pendingMove;

  logger.info("Submitting move", { gameId: gameId.toString(), x, y, round: currentRound });

  try {
    // =========================================================================
    // 1. Precondition check: is move already submitted on-chain?
    // =========================================================================
    const [move1, move2] = await contract.getMoves(gameId);
    const game = await contract.getGame(gameId);
    const isPlayer1 = game.player1.toLowerCase() === playerAddress.toLowerCase();
    const myMove = isPlayer1 ? move1 : move2;

    if (myMove.isSubmitted) {
      logger.info("Move already submitted on-chain, skipping submission");
      return {
        currentPhase: GamePhase.FinalizingMove,
        lastError: null,
      };
    }

    // =========================================================================
    // 2. Check existing tx marker for pending transaction
    // =========================================================================
    const marker = await gameStore.getTxMarker(gameKey, "submitMove");

    if (marker?.tx_status === "pending" && marker.tx_hash) {
      logger.info("Found pending submitMove transaction, checking status...", {
        txHash: marker.tx_hash,
      });

      const txStatus = await contract.getTransactionStatus(marker.tx_hash as `0x${string}`);

      if (txStatus.status === "success") {
        // Transaction succeeded - update marker and proceed
        logger.info("Previous submitMove transaction succeeded");
        await gameStore.updateTxMarker(gameKey, "submitMove", { txStatus: "confirmed" });
        return {
          currentPhase: GamePhase.FinalizingMove,
          lastError: null,
        };
      } else if (txStatus.status === "reverted") {
        // Transaction failed - clear marker and retry
        logger.warn("Previous submitMove transaction reverted, retrying...");
        await gameStore.clearTxMarker(gameKey, "submitMove");
      } else if (txStatus.status === "pending") {
        // Still pending - wait for it
        logger.info("Previous submitMove transaction still pending, waiting...");
        return {
          currentPhase: GamePhase.SubmittingMove,
        };
      } else {
        // Not found - tx was likely dropped, clear and retry
        logger.warn("Previous submitMove transaction not found (dropped?), retrying...");
        await gameStore.clearTxMarker(gameKey, "submitMove");
      }
    }

    // =========================================================================
    // 3. Record attempted move BEFORE sending transaction
    // =========================================================================
    await gameStore.addAttemptedMove(gameKey, x, y, currentRound);

    // =========================================================================
    // 4. Encrypt and submit the move
    // =========================================================================
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    logger.debug("Encrypting move coordinates...");
    const encrypted = await fhe.encryptMove(x, y);
    logger.debug("Move encrypted successfully");

    logger.debug("Submitting encrypted move to contract...");
    const txHash = await contract.submitMove(gameId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);

    // =========================================================================
    // 5. Store tx marker and update attempted move
    // =========================================================================
    await gameStore.setTxMarker(gameKey, "submitMove", {
      txHash,
      txStatus: "confirmed", // We waited for receipt in contract.submitMove
    });

    // Update attempted move with tx hash
    await gameStore.addAttemptedMove(gameKey, x, y, currentRound, txHash);

    logger.info("Move submitted successfully", {
      gameId: gameId.toString(),
      x,
      y,
      txHash,
    });

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
