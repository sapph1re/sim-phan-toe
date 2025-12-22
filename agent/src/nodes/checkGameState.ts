// Check game state node - determines current phase based on contract state

import { createLogger } from "../utils/logger.js";
import { getContractService } from "../services/contract.js";
import { type AgentState, GamePhase, Winner, ZERO_ADDRESS, ZERO_BYTES32 } from "../state.js";

const logger = createLogger("CheckGameState");

export async function checkGameState(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, playerAddress } = state;

  if (gameId === null || !playerAddress) {
    logger.warn("No game ID or player address set");
    return {
      currentPhase: GamePhase.Idle,
      lastError: "No game assigned",
    };
  }

  logger.info("Checking game state", { gameId: gameId.toString() });

  try {
    const contract = getContractService();
    const game = await contract.getGame(gameId);
    const [move1, move2] = await contract.getMoves(gameId);

    // Determine if we're player1 or player2
    const isPlayer1 = game.player1.toLowerCase() === playerAddress.toLowerCase();
    const isPlayer2 = game.player2.toLowerCase() === playerAddress.toLowerCase();

    if (!isPlayer1 && !isPlayer2) {
      logger.error("Not a player in this game", {
        player1: game.player1,
        player2: game.player2,
        ourAddress: playerAddress,
      });
      return {
        currentPhase: GamePhase.Error,
        lastError: "Not a player in this game",
        shouldContinue: false,
      };
    }

    const myMove = isPlayer1 ? move1 : move2;
    const opponentMove = isPlayer1 ? move2 : move1;

    logger.debug("Game state retrieved", {
      gameId: gameId.toString(),
      isPlayer1,
      player2: game.player2,
      winner: game.winner,
      myMoveSubmitted: myMove.isSubmitted,
      myMoveMade: myMove.isMade,
      opponentMoveSubmitted: opponentMove.isSubmitted,
      opponentMoveMade: opponentMove.isMade,
    });

    // Update state with latest game data
    const baseUpdate: Partial<AgentState> = {
      game,
      isPlayer1,
      myMove,
      opponentMove,
      lastError: null,
      retryCount: 0,
    };

    // Check game phase in order of priority

    // 1. Game is finished - check if board needs revealing
    if (game.winner !== Winner.None) {
      logger.info("Game is finished", { winner: game.winner });

      // Check if board is already revealed (any non-zero cell)
      const boardRevealed = game.board.some((row) => row.some((cell) => cell !== 0));

      if (boardRevealed) {
        return {
          ...baseUpdate,
          currentPhase: GamePhase.GameComplete,
          winner: game.winner as Winner,
          shouldContinue: false,
        };
      } else {
        return {
          ...baseUpdate,
          currentPhase: GamePhase.RevealingBoard,
          winner: game.winner as Winner,
        };
      }
    }

    // 2. Waiting for player 2 to join
    if (game.player2 === ZERO_ADDRESS) {
      logger.info("Waiting for opponent to join");
      return {
        ...baseUpdate,
        currentPhase: GamePhase.WaitingForOpponent,
      };
    }

    // 3. Both moves are made - need to finalize game state
    if (myMove.isMade && opponentMove.isMade) {
      // Check if eWinner handle is set (indicates processMoves has run)
      if (game.eWinner !== ZERO_BYTES32) {
        logger.info("Both moves made, finalizing game state");
        return {
          ...baseUpdate,
          currentPhase: GamePhase.FinalizingGameState,
        };
      }
    }

    // 4. Our move is submitted but not made - need to finalize
    if (myMove.isSubmitted && !myMove.isMade) {
      logger.info("Move submitted, needs finalization");
      return {
        ...baseUpdate,
        currentPhase: GamePhase.FinalizingMove,
      };
    }

    // 5. Our move is made, waiting for opponent
    if (myMove.isMade && !opponentMove.isMade) {
      logger.info("Waiting for opponent's move");
      return {
        ...baseUpdate,
        currentPhase: GamePhase.WaitingForOpponentMove,
      };
    }

    // 6. Can submit a new move
    const canSubmit = await contract.canSubmitMove(gameId, playerAddress);
    if (canSubmit) {
      logger.info("Ready to select a move");
      return {
        ...baseUpdate,
        currentPhase: GamePhase.SelectingMove,
      };
    }

    // Default: waiting for something
    logger.debug("Unknown state, defaulting to waiting");
    return {
      ...baseUpdate,
      currentPhase: GamePhase.WaitingForOpponentMove,
    };
  } catch (error) {
    logger.error("Failed to check game state", error);
    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to check game state",
      retryCount: state.retryCount + 1,
    };
  }
}
