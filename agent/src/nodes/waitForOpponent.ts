// Wait for opponent node - logs waiting status and tracks timing
// The orchestrator handles actual scheduling and abandonment logic
// This node just updates state and returns - no sleeping here!

import { createLogger } from "../utils/logger.js";
import { type AgentState, GamePhase } from "../state.js";

const logger = createLogger("WaitForOpponent");

export async function waitForOpponent(state: AgentState): Promise<Partial<AgentState>> {
  const { currentPhase, gameId, waitingSince } = state;

  // Initialize waiting timestamp if not set
  const now = Date.now();
  const newWaitingSince = waitingSince ?? now;

  // Calculate how long we've been waiting
  const waitingMs = now - newWaitingSince;
  const waitingMinutes = Math.floor(waitingMs / 60000);
  const waitingHours = (waitingMs / (1000 * 60 * 60)).toFixed(1);

  // Log what we're waiting for (informational only - no errors for waiting!)
  if (currentPhase === GamePhase.WaitingForOpponent) {
    if (waitingMinutes < 1) {
      logger.info(`Waiting for opponent to join game ${gameId}...`);
    } else if (waitingMinutes < 60) {
      logger.info(`Still waiting for opponent to join game ${gameId}`, { waitingMinutes });
    } else {
      logger.info(`Still waiting for opponent to join game ${gameId}`, { waitingHours: `${waitingHours}h` });
    }
  } else if (currentPhase === GamePhase.WaitingForOpponentMove) {
    if (waitingMinutes < 1) {
      logger.info(`Waiting for opponent's move in game ${gameId}...`);
    } else if (waitingMinutes < 60) {
      logger.info(`Waiting for opponent's move in game ${gameId}`, { waitingMinutes });
    } else {
      logger.info(`Waiting for opponent's move in game ${gameId}`, { waitingHours: `${waitingHours}h` });
    }
  } else if (currentPhase === GamePhase.Idle) {
    logger.debug("Waiting in idle state");
  }

  // Return updated waiting timestamp
  // The orchestrator handles the actual scheduling (next_check_at in DB)
  // No need to sleep here - the orchestrator will call us again when it's time
  return {
    waitingSince: newWaitingSince,
  };
}
