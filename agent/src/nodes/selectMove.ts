// Select move node - uses OpenAI LLM to decide the next move
// With Zod validation and attempted-move enforcement from persistence

import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLogger } from "../utils/logger.js";
import { type AgentState, GamePhase, type LocalMove } from "../state.js";
import { getAllCoords, coordToKey, BOARD_SIZE } from "../utils/board.js";
import * as gameStore from "../persistence/gameStore.js";
import { createGameKey } from "../persistence/gameStore.js";
import { getContractService } from "../services/contract.js";

const logger = createLogger("SelectMove");

// Chain ID for Sepolia
const CHAIN_ID = 11155111;

// Zod schema for move validation
const MoveSchema = z.object({
  x: z.number().int().min(0).max(3),
  y: z.number().int().min(0).max(3),
  reasoning: z.string().optional(),
});

type MoveResponse = z.infer<typeof MoveSchema>;

// System prompt for the LLM
const SYSTEM_PROMPT = `You are an AI agent playing SimPhanToe, a simultaneous phantom 4x4 Tic-Tac-Toe game.

GAME RULES:
- 4x4 board (coordinates 0-3 for both x and y)
- Need 4 in a row/column/diagonal to win
- SIMULTANEOUS moves: both players choose at the same time
- PHANTOM mode: you cannot see opponent's moves until game ends
- If both players pick the same cell, it's a COLLISION and both must pick again
- Board layout (x is column, y is row):
  (0,0) (1,0) (2,0) (3,0)   ← y=0
  (0,1) (1,1) (2,1) (3,1)   ← y=1
  (0,2) (1,2) (2,2) (3,2)   ← y=2
  (0,3) (1,3) (2,3) (3,3)   ← y=3

STRATEGY CONSIDERATIONS:
1. You only know YOUR OWN previous moves
2. NEVER play on cells you've already used
3. Try to build toward 4-in-a-row while being unpredictable
4. Consider probability - opponent might be anywhere you haven't played
5. Center and corner positions are often strategically valuable
6. Mix up patterns to avoid collisions

RESPONSE FORMAT:
You MUST respond with ONLY a valid JSON object containing x and y coordinates.
Do not include any text before or after the JSON.
Example: {"x": 1, "y": 2, "reasoning": "building toward diagonal"}`;

// Maximum retries for LLM failures
const MAX_LLM_RETRIES = 3;

export async function selectMove(state: AgentState): Promise<Partial<AgentState>> {
  const { gameId, myMoves, currentRound, collisionOccurred, playerAddress } = state;

  if (gameId === null || !playerAddress) {
    logger.error("Missing required state for move selection");
    return {
      currentPhase: GamePhase.Error,
      lastError: "Missing game ID or player address",
    };
  }

  const contract = getContractService();
  const gameKey = createGameKey(CHAIN_ID, contract.simphantoeAddress, gameId);

  logger.info("Selecting move", {
    currentRound,
    previousMoves: myMoves.length,
    collisionOccurred,
  });

  try {
    // =========================================================================
    // 1. Get attempted moves from persistence (critical for phantom game!)
    // =========================================================================
    const attemptedMoves = await gameStore.getAttemptedMoves(gameKey);
    
    // Build forbidden cells set - cells we've already tried
    const forbiddenCells = new Set<string>();
    
    // Add all attempted moves (from DB) to forbidden set
    for (const move of attemptedMoves) {
      forbiddenCells.add(coordToKey(move.x, move.y));
    }
    
    // Also add myMoves from state (in case DB isn't synced yet)
    for (const move of myMoves) {
      forbiddenCells.add(coordToKey(move.x, move.y));
    }

    // Get available cells
    const allCoords = getAllCoords();
    const availableCells = allCoords.filter((c) => !forbiddenCells.has(coordToKey(c.x, c.y)));

    logger.debug("Move selection context", {
      forbiddenCount: forbiddenCells.size,
      availableCount: availableCells.length,
      forbidden: Array.from(forbiddenCells),
    });

    // Check if any cells are available
    if (availableCells.length === 0) {
      logger.error("No valid cells remaining!");
      return {
        currentPhase: GamePhase.Error,
        lastError: "No valid cells remaining",
      };
    }

    // =========================================================================
    // 2. Try to get move from LLM with retries
    // =========================================================================
    let selectedMove: { x: number; y: number } | null = null;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < MAX_LLM_RETRIES; attempt++) {
      try {
        const llmMove = await getLLMMove(
          myMoves,
          attemptedMoves,
          currentRound,
          collisionOccurred,
          availableCells,
          attempt > 0 // isRetry
        );

        // Validate move is not forbidden
        if (forbiddenCells.has(coordToKey(llmMove.x, llmMove.y))) {
          logger.warn("LLM chose a forbidden cell", { 
            x: llmMove.x, 
            y: llmMove.y, 
            attempt: attempt + 1 
          });
          lastError = "LLM chose forbidden cell";
          continue;
        }

        selectedMove = llmMove;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn("LLM move selection failed", { attempt: attempt + 1, error: lastError });
      }
    }

    // =========================================================================
    // 3. Fall back to deterministic selection if LLM fails
    // =========================================================================
    if (!selectedMove) {
      logger.warn("LLM failed after retries, using fallback selection");
      selectedMove = selectFallbackMove(availableCells);
      
      if (!selectedMove) {
        return {
          currentPhase: GamePhase.Error,
          lastError: lastError || "Failed to select move",
        };
      }
    }

    logger.info("Selected move", { x: selectedMove.x, y: selectedMove.y });

    return {
      pendingMove: selectedMove,
      currentPhase: GamePhase.SubmittingMove,
      collisionOccurred: false,
    };
  } catch (error) {
    logger.error("Failed to select move", error);

    // Try fallback
    const allCoords = getAllCoords();
    const forbiddenCells = new Set(myMoves.map((m) => coordToKey(m.x, m.y)));
    const availableCells = allCoords.filter((c) => !forbiddenCells.has(coordToKey(c.x, c.y)));
    
    const fallback = selectFallbackMove(availableCells);
    if (fallback) {
      logger.info("Using fallback move selection", fallback);
      return {
        pendingMove: fallback,
        currentPhase: GamePhase.SubmittingMove,
        collisionOccurred: false,
      };
    }

    return {
      currentPhase: GamePhase.Error,
      lastError: error instanceof Error ? error.message : "Failed to select move",
    };
  }
}

/**
 * Get move from LLM with JSON mode and Zod validation
 */
async function getLLMMove(
  myMoves: LocalMove[],
  attemptedMoves: gameStore.AttemptedMoveRecord[],
  currentRound: number,
  collisionOccurred: boolean,
  availableCells: { x: number; y: number }[],
  isRetry: boolean
): Promise<{ x: number; y: number }> {
  // Create model with JSON mode
  const model = new ChatOpenAI({
    modelName: process.env.OPENAI_MODEL || "gpt-4-turbo-preview",
    temperature: 0.7, // Some randomness for unpredictability
  }).bind({
    response_format: { type: "json_object" },
  });

  // Build move history from confirmed moves
  const confirmedMoves = attemptedMoves.filter((m) => m.status === "confirmed");
  const moveHistory = confirmedMoves
    .map((m) => `Round ${m.round}: (${m.x}, ${m.y})`)
    .join("\n");

  const occupiedCells = confirmedMoves.map((m) => `(${m.x},${m.y})`).join(", ");
  const availableCellsList = availableCells.map((c) => `(${c.x},${c.y})`).join(", ");

  // Build user prompt
  let userPrompt = `Current round: ${currentRound + 1}

Your confirmed previous moves:
${moveHistory || "None yet - this is your first move!"}

Cells you've occupied: ${occupiedCells || "None"}

AVAILABLE cells you CAN play: ${availableCellsList}
(You MUST choose from this list!)

${collisionOccurred ? "⚠️ COLLISION occurred last round - your move collided with opponent! Pick a DIFFERENT cell this time!" : ""}
${isRetry ? "⚠️ Your previous choice was invalid. Pick a cell from the AVAILABLE list above!" : ""}

Choose your next move. Remember:
- Pick ONLY from the available cells listed above
- Be strategic but unpredictable
- Consider building toward 4-in-a-row

Respond with JSON only: {"x": <0-3>, "y": <0-3>, "reasoning": "<brief>"}`;

  const response = await model.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  // Parse and validate response
  const content = response.content.toString();
  logger.debug("LLM response", { content });

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No valid JSON in LLM response");
    }
  }

  // Validate with Zod
  const result = MoveSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid move format: ${result.error.message}`);
  }

  const move = result.data;

  // Additional validation
  if (!isValidCoordinate(move.x) || !isValidCoordinate(move.y)) {
    throw new Error(`Coordinates out of bounds: (${move.x}, ${move.y})`);
  }

  if (move.reasoning) {
    logger.debug("LLM reasoning", { reasoning: move.reasoning });
  }

  return { x: move.x, y: move.y };
}

/**
 * Check if coordinate is valid (0-3)
 */
function isValidCoordinate(coord: number): boolean {
  return Number.isInteger(coord) && coord >= 0 && coord < BOARD_SIZE;
}

/**
 * Fallback move selection when LLM fails
 * Uses strategic positioning: center > corners > edges
 */
function selectFallbackMove(
  availableCells: { x: number; y: number }[]
): { x: number; y: number } | null {
  if (availableCells.length === 0) {
    return null;
  }

  // Preferred order: center area, corners, edges
  const preferredOrder = [
    // Center area (most valuable)
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
    // Corners
    { x: 0, y: 0 },
    { x: 3, y: 0 },
    { x: 0, y: 3 },
    { x: 3, y: 3 },
    // Edges
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 3, y: 1 },
    { x: 0, y: 2 },
    { x: 3, y: 2 },
    { x: 1, y: 3 },
    { x: 2, y: 3 },
  ];

  // Create set of available cells for O(1) lookup
  const availableSet = new Set(availableCells.map((c) => coordToKey(c.x, c.y)));

  // Find first preferred position that's available
  for (const pos of preferredOrder) {
    if (availableSet.has(coordToKey(pos.x, pos.y))) {
      return pos;
    }
  }

  // If none of preferred positions available, pick first available
  return availableCells[0];
}
