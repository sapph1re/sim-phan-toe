// Select move node - uses OpenAI LLM to decide the next move

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLogger } from "../utils/logger.js";
import { type AgentState, GamePhase, type LocalMove } from "../state.js";

const logger = createLogger("SelectMove");

// System prompt for the LLM
const SYSTEM_PROMPT = `You are an AI agent playing SimPhanToe, a simultaneous phantom 4x4 Tic-Tac-Toe game.

GAME RULES:
- 4x4 board (coordinates 0-3 for both x and y)
- Need 4 in a row/column/diagonal to win
- SIMULTANEOUS moves: both players choose at the same time
- PHANTOM mode: you cannot see opponent's moves until game ends
- If both players pick the same cell, it's a COLLISION and both must pick again
- Board layout:
  (0,0) (1,0) (2,0) (3,0)   ← y=0
  (0,1) (1,1) (2,1) (3,1)   ← y=1
  (0,2) (1,2) (2,2) (3,2)   ← y=2
  (0,3) (1,3) (2,3) (3,3)   ← y=3

STRATEGY CONSIDERATIONS:
1. You only know YOUR OWN previous moves
2. Avoid cells you've already played
3. Try to build toward 4-in-a-row while being unpredictable
4. Consider probability - opponent might be anywhere you haven't played
5. Center and corner positions are often strategically valuable
6. Mix up patterns to avoid collisions

RESPONSE FORMAT:
Respond with ONLY a JSON object with x and y coordinates:
{"x": <0-3>, "y": <0-3>, "reasoning": "<brief explanation>"}`;

export async function selectMove(state: AgentState): Promise<Partial<AgentState>> {
  const { myMoves, currentRound, collisionOccurred } = state;

  logger.info("Selecting move", {
    currentRound,
    previousMoves: myMoves.length,
    collisionOccurred,
  });

  try {
    const model = new ChatOpenAI({
      modelName: "gpt-4-turbo-preview",
      temperature: 0.7, // Some randomness for unpredictability
    });

    // Build the prompt with game context
    const moveHistory = myMoves.map((m, i) => `Round ${m.round}: (${m.x}, ${m.y})`).join("\n");

    const occupiedCells = myMoves.map((m) => `(${m.x},${m.y})`).join(", ");

    let userPrompt = `Current round: ${currentRound + 1}

Your previous moves:
${moveHistory || "None yet - this is your first move!"}

Cells you've occupied: ${occupiedCells || "None"}
Cells you CANNOT play (already yours): ${occupiedCells || "None"}

${collisionOccurred ? "COLLISION occurred last round - pick a DIFFERENT cell this time!" : ""}

Choose your next move. Remember:
- Pick a cell you haven't used before
- Be strategic but unpredictable
- Consider building toward 4-in-a-row

Respond with JSON only: {"x": <0-3>, "y": <0-3>, "reasoning": "<brief>"}`;

    const response = await model.invoke([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userPrompt)]);

    // Parse the response
    const content = response.content.toString();
    logger.debug("LLM response", { content });

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);
    const x = parseInt(parsed.x, 10);
    const y = parseInt(parsed.y, 10);
    const reasoning = parsed.reasoning || "No reasoning provided";

    // Validate coordinates
    if (isNaN(x) || isNaN(y) || x < 0 || x > 3 || y < 0 || y > 3) {
      throw new Error(`Invalid coordinates: (${x}, ${y})`);
    }

    // Check if cell is already occupied by us
    const alreadyPlayed = myMoves.some((m) => m.x === x && m.y === y);
    if (alreadyPlayed) {
      logger.warn("LLM chose an already-played cell, selecting alternative", { x, y });
      // Find an unoccupied cell
      const alternative = findAlternativeCell(myMoves);
      if (alternative) {
        logger.info("Selected alternative move", alternative);
        return {
          pendingMove: alternative,
          currentPhase: GamePhase.SubmittingMove,
          collisionOccurred: false,
        };
      } else {
        throw new Error("No valid cells remaining");
      }
    }

    logger.info("Selected move", { x, y, reasoning });

    return {
      pendingMove: { x, y },
      currentPhase: GamePhase.SubmittingMove,
      collisionOccurred: false,
    };
  } catch (error) {
    logger.error("Failed to select move", error);

    // Fallback: pick a random unoccupied cell
    const fallback = findAlternativeCell(state.myMoves);
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

// Find an unoccupied cell (fallback strategy)
function findAlternativeCell(myMoves: LocalMove[]): { x: number; y: number } | null {
  const occupied = new Set(myMoves.map((m) => `${m.x},${m.y}`));

  // Prefer strategic positions: center, corners, then edges
  const preferredOrder = [
    // Center area
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

  for (const pos of preferredOrder) {
    if (!occupied.has(`${pos.x},${pos.y}`)) {
      return pos;
    }
  }

  return null;
}
