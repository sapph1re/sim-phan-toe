// Wait for opponent node - polls for game state changes

import { createLogger } from "../utils/logger.js";
import { sleep } from "../utils/retry.js";
import { type AgentState, GamePhase } from "../state.js";

const logger = createLogger("WaitForOpponent");

// Get polling interval from env or default to 5 seconds
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "5000", 10);

export async function waitForOpponent(state: AgentState): Promise<Partial<AgentState>> {
  const { currentPhase, gameId } = state;

  logger.debug("Waiting for opponent...", {
    phase: currentPhase,
    gameId: gameId?.toString(),
  });

  // Log a nice message based on phase
  if (currentPhase === GamePhase.WaitingForOpponent) {
    logger.info("Waiting for an opponent to join the game...");
  } else if (currentPhase === GamePhase.WaitingForOpponentMove) {
    logger.info("Waiting for opponent to make their move...");
  }

  // Wait before checking again
  await sleep(POLL_INTERVAL);

  // Return to check game state
  return {
    // Just return empty - the router will send us back to checkGameState
  };
}

