// Board indexing helpers for SimPhanToe
// CRITICAL: The smart contract uses board[row][col] = board[y][x]
// These helpers enforce consistent indexing everywhere

export const BOARD_SIZE = 4;

/**
 * Get the value of a cell on the board
 * @param board - 2D array representing the game board
 * @param x - Column index (0-3)
 * @param y - Row index (0-3)
 * @returns Cell value at position (x, y)
 *
 * IMPORTANT: board[y][x] = board[row][col]
 */
export function getCell(board: number[][], x: number, y: number): number {
  return board[y][x];
}

/**
 * Set the value of a cell on the board
 * @param board - 2D array representing the game board (mutated in place)
 * @param x - Column index (0-3)
 * @param y - Row index (0-3)
 * @param value - Value to set (0=Empty, 1=Player1, 2=Player2)
 *
 * IMPORTANT: board[y][x] = board[row][col]
 */
export function setCell(board: number[][], x: number, y: number, value: number): void {
  board[y][x] = value;
}

/**
 * Check if coordinates are within valid board bounds
 * @param x - Column index
 * @param y - Row index
 * @returns true if both x and y are in range [0, BOARD_SIZE)
 */
export function isValidCoord(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

/**
 * Get all valid board coordinates
 * @returns Array of {x, y} coordinate pairs
 */
export function getAllCoords(): { x: number; y: number }[] {
  const coords: { x: number; y: number }[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      coords.push({ x, y });
    }
  }
  return coords;
}

/**
 * Create an empty board (all zeros)
 * @returns 4x4 array filled with 0s
 */
export function createEmptyBoard(): number[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
}

/**
 * Convert a coordinate pair to a string key for Set/Map usage
 * @param x - Column index
 * @param y - Row index
 * @returns String in format "x,y"
 */
export function coordToKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Parse a coordinate key back to x, y values
 * @param key - String in format "x,y"
 * @returns Object with x and y values
 */
export function keyToCoord(key: string): { x: number; y: number } {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

/**
 * Check if a cell is empty
 * @param board - The game board
 * @param x - Column index
 * @param y - Row index
 * @returns true if cell value is 0 (empty)
 */
export function isCellEmpty(board: number[][], x: number, y: number): boolean {
  return getCell(board, x, y) === 0;
}

/**
 * Get all empty cells on the board
 * @param board - The game board
 * @returns Array of {x, y} coordinates where cell is empty
 */
export function getEmptyCells(board: number[][]): { x: number; y: number }[] {
  return getAllCoords().filter(({ x, y }) => isCellEmpty(board, x, y));
}

/**
 * Format board for display/logging
 * Uses board[y][x] indexing correctly
 * @param board - The game board
 * @param player1Symbol - Symbol for player 1 (default "X")
 * @param player2Symbol - Symbol for player 2 (default "O")
 * @returns Formatted string representation of the board
 */
export function formatBoard(board: number[][], player1Symbol = "X", player2Symbol = "O"): string {
  const symbols: Record<number, string> = {
    0: "·",
    1: player1Symbol,
    2: player2Symbol,
  };

  const lines: string[] = [];
  lines.push("  0 1 2 3  (x)");
  lines.push("┌───────────┐");

  for (let y = 0; y < BOARD_SIZE; y++) {
    const row = board[y].map((cell) => symbols[cell] || "?").join(" ");
    lines.push(`│ ${row} │ ${y}`);
  }

  lines.push("└───────────┘");
  lines.push("(y)");

  return lines.join("\n");
}
