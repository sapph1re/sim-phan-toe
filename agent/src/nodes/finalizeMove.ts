// Finalize move node - decrypts validity and finalizes move on contract
// With idempotency checks and persistence

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, ZERO_BYTES32 } from "../state.js";
import * as gameStore from "../persistence/gameStore.js";
import { createGameKey } from "../persistence/gameStore.js";

const logger = createLogger("FinalizeMove");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

export async function finalizeMove(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, myMove, pendingMove, currentRound, myMoves } = state;

  if (gameId === null || !playerAddress || !myMove) {
    logger.error("Missing required state for move finalization");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or move data",
    };
  }

  const contract = getContractService();
  const gameKey = createGameKey(CHAIN_ID, contract.simphantoeAddress, gameId);

  // =========================================================================
  // 1. Precondition check: is move already finalized?
  // =========================================================================
  if (myMove.isMade) {
    logger.info("Move already finalized on-chain, proceeding");

    // Update attempted move status if we have a pending move
    if (pendingMove) {
      await gameStore.updateAttemptedMoveStatus(gameKey, pendingMove.x, pendingMove.y, currentRound, "confirmed");
    }

    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
      myMoves: pendingMove ? [...myMoves, { x: pendingMove.x, y: pendingMove.y, round: currentRound }] : myMoves,
      pendingMove: null,
      waitingSince: null, // Reset waiting timer for new phase
    };
  }

  // =========================================================================
  // 2. Check if we have the isInvalid handle (FHE processing might be pending)
  // =========================================================================
  if (myMove.isInvalid === ZERO_BYTES32) {
    logger.warn("No isInvalid handle yet, waiting for FHE processing...");
    return {
      currentPhase: GamePhase.FinalizingMove,
    };
  }

  logger.info("Finalizing move", { gameId: gameId.toString() });

  try {
    // =========================================================================
    // 3. Check existing tx marker for pending transaction
    // =========================================================================
    const marker = await gameStore.getTxMarker(gameKey, "finalizeMove");

    if (marker?.tx_status === "pending" && marker.tx_hash) {
      logger.info("Found pending finalizeMove transaction, checking status...", {
        txHash: marker.tx_hash,
      });

      const txStatus = await contract.getTransactionStatus(marker.tx_hash as `0x${string}`);

      if (txStatus.status === "success") {
        logger.info("Previous finalizeMove transaction succeeded");
        await gameStore.updateTxMarker(gameKey, "finalizeMove", { txStatus: "confirmed" });

        // OPTIMIZED: Use multicall to batch getGame + getMoves into single RPC call
        const { game, moves } = await contract.getGameWithMoves(gameId);
        const [move1, move2] = moves;
        const isPlayer1 = game.player1.toLowerCase() === playerAddress.toLowerCase();
        const updatedMyMove = isPlayer1 ? move1 : move2;

        if (updatedMyMove.isMade) {
          // Move was valid and made
          if (pendingMove) {
            await gameStore.updateAttemptedMoveStatus(gameKey, pendingMove.x, pendingMove.y, currentRound, "confirmed");
          }
          return {
            currentPhase: GamePhase.WaitingForOpponentMove,
            myMoves: pendingMove ? [...myMoves, { x: pendingMove.x, y: pendingMove.y, round: currentRound }] : myMoves,
            pendingMove: null,
            waitingSince: null,
          };
        } else {
          // Move was invalid
          if (pendingMove) {
            await gameStore.updateAttemptedMoveStatus(gameKey, pendingMove.x, pendingMove.y, currentRound, "invalid");
          }
          return {
            currentPhase: GamePhase.SelectingMove,
            pendingMove: null,
            lastError: "Move was invalid - cell may have been occupied",
          };
        }
      } else if (txStatus.status === "reverted") {
        logger.warn("Previous finalizeMove transaction reverted, retrying...");
        await gameStore.clearTxMarker(gameKey, "finalizeMove");
      } else if (txStatus.status === "pending") {
        logger.info("Previous finalizeMove transaction still pending, waiting...");
        return {
          currentPhase: GamePhase.FinalizingMove,
        };
      } else {
        logger.warn("Previous finalizeMove transaction not found (dropped?), retrying...");
        await gameStore.clearTxMarker(gameKey, "finalizeMove");
      }
    }

    // =========================================================================
    // 4. Decrypt the isInvalid flag and call finalizeMove
    // =========================================================================
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    logger.debug("Decrypting move validity...");
    const { value: isInvalid, proof } = await fhe.decryptBool(myMove.isInvalid);

    logger.debug("Move validity decrypted", { isInvalid });

    logger.debug("Calling finalizeMove on contract...");
    const txHash = await contract.finalizeMove(gameId, playerAddress, isInvalid, proof);

    // =========================================================================
    // 5. Store tx marker
    // =========================================================================
    await gameStore.setTxMarker(gameKey, "finalizeMove", {
      txHash,
      txStatus: "confirmed",
    });

    // =========================================================================
    // 6. Handle result
    // =========================================================================
    if (isInvalid) {
      // Move was invalid (tried to play on occupied cell)
      logger.warn("Move was invalid! Need to select a new move.");

      if (pendingMove) {
        await gameStore.updateAttemptedMoveStatus(gameKey, pendingMove.x, pendingMove.y, currentRound, "invalid");
      }

      return {
        currentPhase: GamePhase.SelectingMove,
        pendingMove: null,
        lastError: "Move was invalid - cell may have been occupied",
      };
    }

    // Move was valid - commit it to our local history
    logger.info("Move finalized successfully");

    if (pendingMove) {
      await gameStore.updateAttemptedMoveStatus(gameKey, pendingMove.x, pendingMove.y, currentRound, "confirmed");
    }

    const newMove = pendingMove ? { x: pendingMove.x, y: pendingMove.y, round: currentRound } : null;

    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
      myMoves: newMove ? [...myMoves, newMove] : myMoves,
      pendingMove: null,
      lastError: null,
      waitingSince: null, // Reset waiting timer for new phase
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
