// LangGraph state machine definition for SimPhanToe agent

import { StateGraph, END } from "@langchain/langgraph";
import { createLogger } from "./utils/logger.js";
import { AgentStateAnnotation, type AgentState, GamePhase } from "./state.js";
import {
  checkGameState,
  selectMove,
  submitMove,
  finalizeMove,
  finalizeGameState,
  revealBoard,
  waitForOpponent,
} from "./nodes/index.js";

const logger = createLogger("Graph");

// Maximum retries before giving up
const MAX_RETRIES = 3;

// Router function to determine next node based on current phase
function routeFromCheckState(state: AgentState): string {
  logger.debug("Routing from checkGameState", { phase: state.currentPhase });

  switch (state.currentPhase) {
    case GamePhase.Idle:
    case GamePhase.WaitingForOpponent:
    case GamePhase.WaitingForOpponentMove:
      return "waitForOpponent";

    case GamePhase.SelectingMove:
      return "selectMove";

    case GamePhase.SubmittingMove:
      return "submitMove";

    case GamePhase.FinalizingMove:
      return "finalizeMove";

    case GamePhase.FinalizingGameState:
      return "finalizeGameState";

    case GamePhase.RevealingBoard:
      return "revealBoard";

    case GamePhase.GameComplete:
      return END;

    case GamePhase.Error:
      if (state.retryCount < MAX_RETRIES) {
        logger.warn("Error occurred, retrying...", {
          retryCount: state.retryCount,
          error: state.lastError,
        });
        return "waitForOpponent"; // Wait and retry
      }
      logger.error("Max retries exceeded, ending", { error: state.lastError });
      return END;

    default:
      logger.warn("Unknown phase, checking state", { phase: state.currentPhase });
      return "waitForOpponent";
  }
}

// Router after waiting - END the graph so orchestrator regains control
// The orchestrator will re-invoke the graph when it's time to check again
function routeAfterWait(_state: AgentState): string {
  // In orchestrator mode, we want to END here so the orchestrator can:
  // 1. Save state to DB
  // 2. Move to the next game in round-robin
  // 3. Re-invoke this game later based on next_check_at scheduling
  return END;
}

// Router after select move
function routeAfterSelect(state: AgentState): string {
  // If selectMove failed (e.g., no valid cells remaining), end the graph
  if (state.currentPhase === GamePhase.Error) {
    logger.error("SelectMove failed, ending graph", { error: state.lastError });
    return END;
  }
  if (state.pendingMove) {
    return "submitMove";
  }
  return "checkGameState";
}

// Router after submit move
function routeAfterSubmit(state: AgentState): string {
  if (state.currentPhase === GamePhase.Error) {
    return "checkGameState";
  }
  return "finalizeMove";
}

// Router after finalize move
function routeAfterFinalizeMove(state: AgentState): string {
  switch (state.currentPhase) {
    case GamePhase.SelectingMove:
      // Move was invalid, need to pick again
      return "selectMove";
    case GamePhase.WaitingForOpponentMove:
      // Move finalized, now waiting - END to return control to orchestrator
      return "waitForOpponent";
    case GamePhase.Error:
      return "checkGameState";
    default:
      return "checkGameState";
  }
}

// Router after finalize game state
function routeAfterFinalizeGameState(state: AgentState): string {
  switch (state.currentPhase) {
    case GamePhase.RevealingBoard:
      return "revealBoard";
    case GamePhase.SelectingMove:
      // Collision or continue playing
      return "selectMove";
    case GamePhase.Error:
      return "checkGameState";
    default:
      return "checkGameState";
  }
}

// Router after reveal board
function routeAfterReveal(state: AgentState): string {
  if (state.currentPhase === GamePhase.GameComplete) {
    return END;
  }
  return "checkGameState";
}

// Build the graph
export function buildGraph() {
  logger.info("Building agent graph...");

  const graph = new StateGraph(AgentStateAnnotation)
    // Add nodes
    .addNode("checkGameState", checkGameState)
    .addNode("waitForOpponent", waitForOpponent)
    .addNode("selectMove", selectMove)
    .addNode("submitMove", submitMove)
    .addNode("finalizeMove", finalizeMove)
    .addNode("finalizeGameState", finalizeGameState)
    .addNode("revealBoard", revealBoard)

    // Set entry point
    .addEdge("__start__", "checkGameState")

    // Add conditional edges from checkGameState
    .addConditionalEdges("checkGameState", routeFromCheckState, [
      "waitForOpponent",
      "selectMove",
      "submitMove",
      "finalizeMove",
      "finalizeGameState",
      "revealBoard",
      END,
    ])

    // Add edges from other nodes
    // waitForOpponent now goes to END to return control to orchestrator
    .addConditionalEdges("waitForOpponent", routeAfterWait, [END])
    .addConditionalEdges("selectMove", routeAfterSelect, ["submitMove", "checkGameState", END])
    .addConditionalEdges("submitMove", routeAfterSubmit, ["finalizeMove", "checkGameState"])
    .addConditionalEdges("finalizeMove", routeAfterFinalizeMove, ["selectMove", "waitForOpponent", "checkGameState"])
    .addConditionalEdges("finalizeGameState", routeAfterFinalizeGameState, [
      "revealBoard",
      "selectMove",
      "checkGameState",
    ])
    .addConditionalEdges("revealBoard", routeAfterReveal, ["checkGameState", END]);

  logger.info("Graph built successfully");

  return graph.compile();
}

// Export compiled graph type
export type CompiledGraph = ReturnType<typeof buildGraph>;
