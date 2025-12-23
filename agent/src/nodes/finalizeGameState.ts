// Finalize game state node - decrypts winner/collision and resolves the round
// With idempotency checks and persistence

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { createFHEService } from "../services/fhe.js";
import { type AgentState, GamePhase, Winner, ZERO_BYTES32 } from "../state.js";
import * as gameStore from "../persistence/gameStore.js";
import { createGameKey } from "../persistence/gameStore.js";

const logger = createLogger("FinalizeGameState");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

export async function finalizeGameState(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress, game, currentRound, pendingMove } = state;

  if (gameId === null || !playerAddress || !game) {
    logger.error("Missing required state for game finalization");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID, player address, or game data",
    };
  }

  const contract = getContractService();
  const gameKey = createGameKey(CHAIN_ID, contract.simphantoeAddress, gameId);

  // =========================================================================
  // 1. Precondition check: is game already finalized with a winner?
  // =========================================================================
  // Re-fetch game state to get latest
  const currentGame = await contract.getGame(gameId);
  
  if (currentGame.winner !== Winner.None) {
    logger.info("Game already has a winner, proceeding to reveal", { winner: currentGame.winner });
    return {
      currentPhase: GamePhase.RevealingBoard,
      winner: currentGame.winner as Winner,
      game: currentGame,
    };
  }

  // =========================================================================
  // 2. Check if we have the handles to decrypt
  // =========================================================================
  if (game.eWinner === ZERO_BYTES32) {
    logger.warn("No winner handle yet, waiting for move processing");
    return {
      currentPhase: GamePhase.WaitingForOpponentMove,
    };
  }

  logger.info("Finalizing game state", { gameId: gameId.toString() });

  try {
    // =========================================================================
    // 3. Check existing tx marker for pending transaction
    // =========================================================================
    const marker = await gameStore.getTxMarker(gameKey, "finalizeGameState");

    if (marker?.tx_status === "pending" && marker.tx_hash) {
      logger.info("Found pending finalizeGameState transaction, checking status...", {
        txHash: marker.tx_hash,
      });

      const txStatus = await contract.getTransactionStatus(marker.tx_hash as `0x${string}`);

      if (txStatus.status === "success") {
        logger.info("Previous finalizeGameState transaction succeeded");
        await gameStore.updateTxMarker(gameKey, "finalizeGameState", { txStatus: "confirmed" });
        
        // Re-fetch game state to see result
        const updatedGame = await contract.getGame(gameId);
        
        if (updatedGame.winner !== Winner.None) {
          return {
            currentPhase: GamePhase.RevealingBoard,
            winner: updatedGame.winner as Winner,
            currentRound: currentRound + 1,
            game: updatedGame,
          };
        }
        
        // Check for collision by seeing if moves were reset
        const [move1, move2] = await contract.getMoves(gameId);
        if (!move1.isSubmitted && !move2.isSubmitted) {
          // Moves were cleared - likely a collision occurred
          logger.info("Collision detected - moves were reset");
          
          // Mark pending move as collision
          if (pendingMove) {
            await gameStore.updateAttemptedMoveStatus(
              gameKey,
              pendingMove.x,
              pendingMove.y,
              currentRound,
              "collision"
            );
          }

          return {
            currentPhase: GamePhase.SelectingMove,
            collisionOccurred: true,
            game: updatedGame,
          };
        }
        
        // No winner, no collision - continue
        return {
          currentPhase: GamePhase.SelectingMove,
          currentRound: currentRound + 1,
          collisionOccurred: false,
          game: updatedGame,
        };
      } else if (txStatus.status === "reverted") {
        logger.warn("Previous finalizeGameState transaction reverted, retrying...");
        await gameStore.clearTxMarker(gameKey, "finalizeGameState");
      } else if (txStatus.status === "pending") {
        logger.info("Previous finalizeGameState transaction still pending, waiting...");
        return {
          currentPhase: GamePhase.FinalizingGameState,
        };
      } else {
        logger.warn("Previous finalizeGameState transaction not found (dropped?), retrying...");
        await gameStore.clearTxMarker(gameKey, "finalizeGameState");
      }
    }

    // =========================================================================
    // 4. Decrypt winner and collision, then call finalizeGameState
    // =========================================================================
    const fhe = createFHEService(contract.simphantoeAddress, playerAddress);

    logger.debug("Decrypting game state...");
    const { winner, collision, proof } = await fhe.decryptGameState(game.eWinner, game.eCollision);

    logger.info("Game state decrypted", { winner, collision });

    logger.debug("Calling finalizeGameState on contract...");
    const txHash = await contract.finalizeGameState(gameId, winner, collision, proof);

    // =========================================================================
    // 5. Store tx marker
    // =========================================================================
    await gameStore.setTxMarker(gameKey, "finalizeGameState", {
      txHash,
      txStatus: "confirmed",
    });

    // =========================================================================
    // 6. Handle the result
    // =========================================================================
    if (collision) {
      logger.info("Collision occurred! Both players chose the same cell.");
      
      // Mark pending move as collision
      if (pendingMove) {
        await gameStore.updateAttemptedMoveStatus(
          gameKey,
          pendingMove.x,
          pendingMove.y,
          currentRound,
          "collision"
        );
      }

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
