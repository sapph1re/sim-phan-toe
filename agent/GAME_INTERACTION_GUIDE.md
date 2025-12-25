# SimPhanToe Agent Interaction Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Key Concepts](#architecture--key-concepts)
3. [Contract Information](#contract-information)
4. [Game State & Enums](#game-state--enums)
5. [Complete Game Flow Diagram](#complete-game-flow-diagram)
6. [Step-by-Step Interactions](#step-by-step-interactions)
   - [Reading Game State](#reading-game-state)
   - [Starting a Game](#starting-a-game)
   - [Joining a Game](#joining-a-game)
   - [Submitting a Move](#submitting-a-move)
   - [Finalizing a Move](#finalizing-a-move)
   - [Finalizing Game State](#finalizing-game-state)
   - [Revealing the Board](#revealing-the-board)
7. [FHE Operations (Zama Protocol)](#fhe-operations-zama-protocol)
8. [Events Reference](#events-reference)
9. [Error Handling](#error-handling)
10. [Strategy Considerations](#strategy-considerations)

---

## Overview

**SimPhanToe** is a Simultaneous Phantom 4x4 Tic-Tac-Toe game built on Zama's fhEVM (Fully Homomorphic Encryption
Virtual Machine).

### Key Game Features

- **Simultaneous Moves**: Both players select their cells at the same time - no turn order, no first-mover advantage
- **Phantom Mode**: Player moves are encrypted using FHE - you can only see your own moves, not your opponent's
- **4x4 Board**: Requires 4 in a row/column/diagonal to win
- **Collision Rule**: If both players select the same cell, neither move counts - both must pick again
- **Win Conditions**:
  - Get 4 in a row, column, or diagonal
  - If both complete a line simultaneously, it's a Draw
  - If board fills with no winner, it's a Draw

### Staking & Timeouts

- **Optional Stakes**: Player1 can set an ETH stake when creating a game. Player2 must match it to join.
- **Move Timeout**: Each game has a configurable timeout (1 hour to 7 days). If a player doesn't complete their move in
  time, the opponent can claim victory.
- **Prize Distribution**: Winner takes the entire pot (2x stake). Draws split evenly.
- **Game Cancellation**: Player1 can cancel an unjoined game to get their stake refunded.

### Network

- **Supported Network**: Sepolia Testnet only (Chain ID: 11155111)
- FHE operations require Zama's infrastructure which is deployed on Sepolia

---

## Architecture & Key Concepts

### Fully Homomorphic Encryption (FHE)

FHE allows computations on encrypted data without decrypting it. In SimPhanToe:

- **Encrypted Board (`eBoard`)**: The actual game board is encrypted - even the contract cannot see its contents during
  gameplay
- **Encrypted Moves**: Player coordinates (x, y) are submitted encrypted
- **Encrypted Winner/Collision**: Game state checks happen in FHE, results are decrypted via Zama's KMS

### Ciphertext Handles

Encrypted values are represented as `bytes32` handles. These handles point to ciphertexts stored in the FHE coprocessor.
To get the actual value, you must:

1. Request decryption from Zama's relayer/KMS
2. Receive a decryption proof (KMS signature)
3. Submit the decrypted value + proof to the contract

### Two-Phase Operations

Most operations in SimPhanToe follow a two-phase pattern:

1. **Submit encrypted data** → Contract validates in FHE
2. **Decrypt result** → Submit decrypted value with proof for finalization

---

## Contract Information

### Deployed Contract

```
Network: Sepolia Testnet (Chain ID: 11155111)
Contract Address: 0xF72E2d02476cAcbcE01c164da33858C49Fa55036
```

### Contract ABI Summary

The full ABI is available in `frontend/simphantoe/src/lib/contracts.ts` or the deployment artifact at
`deployments/sepolia/SimPhanToe.json`.

---

## Game State & Enums

### Cell Enum

```solidity
enum Cell {
    Empty = 0,
    Player1 = 1,
    Player2 = 2
}
```

### Winner Enum

```solidity
enum Winner {
    None = 0,      // Game in progress
    Player1 = 1,   // Player 1 won
    Player2 = 2,   // Player 2 won
    Draw = 3,      // Draw (both win simultaneously or board full)
    Cancelled = 4  // Game cancelled before player2 joined (plaintext only)
}
```

### Game Struct

```solidity
struct Game {
  uint256 gameId;
  address player1;
  address player2; // 0x0 if waiting for player 2
  euint8[4][4] eBoard; // Encrypted board (bytes32 handles)
  euint8 eWinner; // Encrypted winner (bytes32 handle)
  ebool eCollision; // Encrypted collision flag (bytes32 handle)
  Cell[4][4] board; // Cleartext board (only populated after game ends + reveal)
  Winner winner; // Cleartext winner (set when game ends)
  uint256 stake; // ETH stake per player (in wei)
  uint256 moveTimeout; // Time limit for moves (in seconds)
  uint256 lastActionTimestamp; // Timestamp of last game action
}
```

### Move Struct

```solidity
struct Move {
  bool isSubmitted; // Player has submitted this round
  bool isMade; // Move has been validated and finalized
  ebool isInvalid; // Encrypted validity flag (bytes32 handle)
  ebool isCellOccupied; // Was the cell already occupied (bytes32 handle)
  euint8 x; // Encrypted x coordinate (bytes32 handle)
  euint8 y; // Encrypted y coordinate (bytes32 handle)
}
```

---

## Complete Game Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GAME LIFECYCLE                                      │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: GAME SETUP
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Player 1                              Contract                  Player 2    │
│     │                                      │                         │       │
│     │──── startGame() ────────────────────>│                         │       │
│     │                                      │ [GameStarted event]     │       │
│     │                                      │                         │       │
│     │                     getOpenGames() <─│────────────────────────>│       │
│     │                                      │                         │       │
│     │                                      │<──── joinGame(gameId) ──│       │
│     │                                      │ [PlayerJoined event]    │       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

PHASE 2: MOVE ROUND (repeats until winner)
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Player 1                              Contract                  Player 2    │
│     │                                      │                         │       │
│     │ [Encrypt move (x,y) via FHE SDK]     │    [Encrypt move (x,y)] │       │
│     │                                      │                         │       │
│     │──── submitMove(gameId, eX, eY, proof)│                         │       │
│     │                                      │ [MoveSubmitted event]   │       │
│     │                                      │                         │       │
│     │                                      │<── submitMove(...) ─────│       │
│     │                                      │ [MoveSubmitted event]   │       │
│     │                                      │                         │       │
│ [Decrypt isInvalid handle via Relayer]     │    [Decrypt isInvalid]  │       │
│     │                                      │                         │       │
│     │──── finalizeMove(gameId, player,     │                         │       │
│     │       isInvalid, decryptProof) ──────│                         │       │
│     │                                      │ [MoveMade/MoveInvalid]  │       │
│     │                                      │                         │       │
│     │                                      │<── finalizeMove(...) ───│       │
│     │                                      │ [MoveMade/MoveInvalid]  │       │
│     │                                      │                         │       │
│     │                                      │ ┌──────────────────────┐│       │
│     │                                      │ │ BOTH MOVES FINALIZED ││       │
│     │                                      │ │ processMoves() auto  ││       │
│     │                                      │ │ [MovesProcessed evt] ││       │
│     │                                      │ └──────────────────────┘│       │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

PHASE 3: ROUND RESOLUTION
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Any Player                            Contract                              │
│     │                                      │                                 │
│     │ [Decrypt eWinner + eCollision via Relayer]                             │
│     │                                      │                                 │
│     │──── finalizeGameState(gameId,        │                                 │
│     │       winner, collision, proof) ─────│                                 │
│     │                                      │                                 │
│     │      ┌───────────────────────────────│                                 │
│     │      │ IF collision == true:         │                                 │
│     │      │   [Collision event]           │                                 │
│     │      │   → Return to Phase 2         │                                 │
│     │      │                               │                                 │
│     │      │ IF winner != None:            │                                 │
│     │      │   [GameUpdated event]         │                                 │
│     │      │   → Go to Phase 4             │                                 │
│     │      │                               │                                 │
│     │      │ IF winner == None:            │                                 │
│     │      │   [GameUpdated event]         │                                 │
│     │      │   → Return to Phase 2         │                                 │
│     │      └───────────────────────────────│                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

PHASE 4: BOARD REVEAL (after game ends)
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Any Player                            Contract                              │
│     │                                      │                                 │
│     │ [Decrypt all 16 eBoard handles via Relayer]                            │
│     │                                      │                                 │
│     │──── revealBoard(gameId,              │                                 │
│     │       board[4][4], proof) ───────────│                                 │
│     │                                      │ [BoardRevealed event]           │
│     │                                      │                                 │
│     │ GAME COMPLETE - board visible to all │                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Interactions

### Reading Game State

#### Get Total Game Count

```typescript
// Function: gameCount() → uint256
const count = await contract.gameCount();
```

#### Get Open Games (Waiting for Player 2)

```typescript
// Function: getOpenGames() → uint256[]
const openGameIds = await contract.getOpenGames();
// Returns array of game IDs where player2 == address(0)
```

#### Get Games by Player

```typescript
// Function: getGamesByPlayer(address _player) → uint256[]
const myGameIds = await contract.getGamesByPlayer(playerAddress);
// Returns array of game IDs where player is player1 or player2
```

#### Get Game Details

```typescript
// Function: getGame(uint256 _gameId) → Game
const game = await contract.getGame(gameId);
// Returns:
// {
//   gameId: bigint,
//   player1: address,
//   player2: address (or 0x0 if waiting),
//   eBoard: bytes32[4][4] (encrypted handles),
//   eWinner: bytes32 (encrypted handle),
//   eCollision: bytes32 (encrypted handle),
//   board: uint8[4][4] (cleartext, populated after reveal),
//   winner: uint8 (0=None, 1=Player1, 2=Player2, 3=Draw, 4=Cancelled),
//   stake: bigint (wei per player),
//   moveTimeout: bigint (seconds),
//   lastActionTimestamp: bigint (unix timestamp)
// }
```

#### Get Move Status

```typescript
// Function: getMoves(uint256 _gameId) → (Move, Move)
const [move1, move2] = await contract.getMoves(gameId);
// move1 is player1's current move, move2 is player2's
// Each Move has:
// {
//   isSubmitted: bool,  // Has submitted this round
//   isMade: bool,       // Has been validated
//   isInvalid: bytes32, // Handle to check if move was invalid
//   isCellOccupied: bytes32,
//   x: bytes32,         // Encrypted x
//   y: bytes32          // Encrypted y
// }
```

#### Check if Player Can Submit Move

```typescript
// Function: canSubmitMove(uint256 _gameId, address _player) → bool
const canSubmit = await contract.canSubmitMove(gameId, playerAddress);
// Returns true if:
// - Game has both players
// - Game not finished
// - Player hasn't submitted this round
```

---

### Starting a Game

#### Prerequisites

- Wallet connected on Sepolia
- Have ETH for gas (plus stake if desired)

#### Steps

1. **Call `startGame(moveTimeout)` with optional stake**

```typescript
// Function: startGame(uint256 _moveTimeout) payable
// _moveTimeout: Time limit for each move (MIN: 1 hour, MAX: 7 days)
// msg.value: Optional stake amount (opponent must match to join)
// Emits: GameStarted(gameId, player1, stake, moveTimeout)

const moveTimeout = 86400n; // 24 hours in seconds
const stake = parseEther("0.01"); // Optional: 0.01 ETH stake

const tx = await contract.startGame(moveTimeout, { value: stake });
await tx.wait();
```

2. **Get your game ID from the event**

```typescript
const receipt = await tx.wait();
const event = receipt.logs.find((log) => {
  const parsed = contract.interface.parseLog(log);
  return parsed?.name === "GameStarted";
});
const gameId = event.args.gameId;
```

3. **Wait for opponent** - Game is now in open games list

---

### Joining a Game

#### Prerequisites

- Open game exists
- You are not player1 of that game
- You have enough ETH to match the stake (if any)

#### Steps

1. **Find open games and check stake**

```typescript
const openGames = await contract.getOpenGames();
const gameIdToJoin = openGames[0]; // Pick one

// Check the required stake
const game = await contract.getGame(gameIdToJoin);
const requiredStake = game.stake; // Must send exactly this amount
```

2. **Join the game with matching stake**

```typescript
// Function: joinGame(uint256 _gameId) payable
// msg.value: Must exactly match game.stake
// Emits: PlayerJoined(gameId, player2)
// Reverts if: game not found, already full, you're player1, or stake doesn't match
const tx = await contract.joinGame(gameIdToJoin, { value: requiredStake });
await tx.wait();
```

---

### Cancelling a Game

Player1 can cancel an unjoined game to get their stake refunded.

#### Prerequisites

- You are player1 of the game
- No player2 has joined yet
- Game is not already finished/cancelled

#### Steps

```typescript
// Function: cancelGame(uint256 _gameId)
// Emits: GameCancelled(gameId)
// Refunds stake to player1
const tx = await contract.cancelGame(gameId);
await tx.wait();
// Game is now marked as Winner.Cancelled
```

---

### Claiming Timeout Victory

If opponent hasn't made their move within the timeout period, you can claim victory.

#### Prerequisites

- Game has both players
- Game is not finished
- `block.timestamp >= lastActionTimestamp + moveTimeout`
- You have made your move (or opponent timed out on their turn)

#### Steps

```typescript
// Function: claimTimeout(uint256 _gameId)
// Emits: GameTimeout(gameId, winner)
// Distributes prize to winner (or splits on draw if both timed out)

// Check if timeout has elapsed
const game = await contract.getGame(gameId);
const now = BigInt(Math.floor(Date.now() / 1000));
const deadline = game.lastActionTimestamp + game.moveTimeout;

if (now >= deadline) {
  const tx = await contract.claimTimeout(gameId);
  await tx.wait();
}
```

---

### Submitting a Move

This is the most complex operation as it involves FHE encryption.

#### Prerequisites

- Game has both players
- Game not finished
- You haven't submitted this round
- FHE SDK initialized (Zama Relayer SDK)

#### Steps

1. **Initialize FHE SDK**

```typescript
import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";

// Initialize WASM (once)
await initSDK({ thread: 0 });

// Create instance
const fheInstance = await createInstance({
  ...SepoliaConfig,
  network: window.ethereum, // or your provider
});
```

2. **Encrypt the move coordinates**

```typescript
// x, y are 0-3 (4x4 board)
const input = fheInstance.createEncryptedInput(contractAddress, playerAddress);
input.add8(x); // x coordinate as uint8
input.add8(y); // y coordinate as uint8
const encrypted = await input.encrypt();

// encrypted.handles[0] = encrypted x (bytes32)
// encrypted.handles[1] = encrypted y (bytes32)
// encrypted.inputProof = ZK proof (bytes)
```

3. **Submit to contract**

```typescript
// Function: submitMove(uint256 _gameId, bytes32 _inputX, bytes32 _inputY, bytes _inputProof)
// Emits: MoveSubmitted(gameId, player)
const tx = await contract.submitMove(gameId, encrypted.handles[0], encrypted.handles[1], encrypted.inputProof);
await tx.wait();
```

4. **Proceed to Finalize Move** (see next section)

---

### Finalizing a Move

After submitting, you must finalize the move by decrypting and verifying the validity flag.

#### Prerequisites

- Move has been submitted (`isSubmitted == true`)
- Move not yet finalized (`isMade == false`)

#### Steps

1. **Get the isInvalid handle**

```typescript
const [move1, move2] = await contract.getMoves(gameId);
const myMove = isPlayer1 ? move1 : move2;
const isInvalidHandle = myMove.isInvalid;
```

2. **Decrypt via Zama Relayer**

```typescript
// Public decryption - anyone can request this for publicly decryptable handles
const result = await fheInstance.publicDecrypt([isInvalidHandle]);

// result.clearValues[isInvalidHandle] = boolean (true if move was invalid)
// result.decryptionProof = KMS signature (bytes)
const isInvalid = result.clearValues[isInvalidHandle];
const decryptionProof = result.decryptionProof;
```

3. **Call finalizeMove**

```typescript
// Function: finalizeMove(uint256 _gameId, address _player, bool _isInvalid, bytes _decryptionProof)
// Emits: MoveMade(gameId, player) if valid
// Emits: MoveInvalid(gameId, player) if invalid (player must resubmit)
const tx = await contract.finalizeMove(gameId, playerAddress, isInvalid, decryptionProof);
await tx.wait();
```

4. **If move was invalid**, player needs to submit a different move

5. **When BOTH players have finalized valid moves**, the contract automatically calls `processMoves()` internally:
   - Emits `MovesProcessed(gameId)`
   - Updates encrypted board
   - Computes winner/collision in FHE

---

### Finalizing Game State

After both moves are processed, someone needs to finalize the round by decrypting the winner and collision flags.

#### Prerequisites

- Both players have finalized their moves
- `MovesProcessed` event was emitted

#### Steps

1. **Get the encrypted handles**

```typescript
const game = await contract.getGame(gameId);
const winnerHandle = game.eWinner;
const collisionHandle = game.eCollision;
```

2. **Decrypt via Zama Relayer**

```typescript
const result = await fheInstance.publicDecrypt([winnerHandle, collisionHandle]);

const winner = Number(result.clearValues[winnerHandle]); // 0, 1, 2, or 3
const collision = result.clearValues[collisionHandle]; // boolean
const decryptionProof = result.decryptionProof;
```

3. **Call finalizeGameState**

```typescript
// Function: finalizeGameState(uint256 _gameId, uint8 _winner, bool _collision, bytes _decryptionProof)
// Emits: Collision(gameId) if collision == true
// Emits: GameUpdated(gameId, winner) otherwise
const tx = await contract.finalizeGameState(gameId, winner, collision, decryptionProof);
await tx.wait();
```

4. **Handle the result**:
   - **If `collision == true`**: Both players chose the same cell. The moves are discarded, and players must submit new
     moves. (Return to submitting moves phase)
   - **If `winner == 0 (None)`**: Round complete, no winner yet. Players submit next round of moves.
   - **If `winner != 0`**: Game is over! Proceed to board reveal.

---

### Revealing the Board

After the game ends (winner != None), the board can be publicly revealed.

#### Prerequisites

- Game has finished (`game.winner != Winner.None`)

#### Steps

1. **Get all 16 board cell handles**

```typescript
const game = await contract.getGame(gameId);
const boardHandles = [];
for (let i = 0; i < 4; i++) {
  for (let j = 0; j < 4; j++) {
    boardHandles.push(game.eBoard[i][j]);
  }
}
```

2. **Decrypt all handles**

```typescript
const result = await fheInstance.publicDecrypt(boardHandles);

// Build the cleartext board
const board = [];
for (let i = 0; i < 4; i++) {
  board[i] = [];
  for (let j = 0; j < 4; j++) {
    board[i][j] = Number(result.clearValues[game.eBoard[i][j]]);
  }
}
// board[y][x] = 0 (Empty), 1 (Player1), or 2 (Player2)
```

3. **Call revealBoard**

```typescript
// Function: revealBoard(uint256 _gameId, uint8[4][4] _board, bytes _decryptionProof)
// Emits: BoardRevealed(gameId)
const tx = await contract.revealBoard(gameId, board, result.decryptionProof);
await tx.wait();
```

4. **After reveal**, the `game.board` field contains the cleartext board visible to everyone.

---

## FHE Operations (Zama Protocol)

### SDK Initialization

```typescript
import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/bundle";

// Step 1: Load WASM (do once at startup)
await initSDK({ thread: 0 }); // thread: 0 disables threading for browser compatibility

// Step 2: Create instance (after wallet is connected)
const fheInstance = await createInstance({
  ...SepoliaConfig,
  network: window.ethereum,
});
```

### Encryption (for move coordinates)

```typescript
const input = fheInstance.createEncryptedInput(contractAddress, senderAddress);
input.add8(value1); // Add uint8 value
input.add8(value2); // Add another uint8 value
const encrypted = await input.encrypt();

// Result:
// encrypted.handles: bytes32[] - array of ciphertext handles
// encrypted.inputProof: bytes - ZK proof of correct encryption
```

### Public Decryption

Public decryption is used for ciphertexts that have been marked as publicly decryptable via
`FHE.makePubliclyDecryptable()`.

```typescript
const handles = [handle1, handle2, ...]; // bytes32 array
const result = await fheInstance.publicDecrypt(handles);

// Result:
// result.clearValues: { [handle]: value } - decrypted values
// result.decryptionProof: bytes - KMS signature to verify on-chain
```

### Important Notes

- **Encryption** requires the sender's address and contract address for access control
- **Decryption proofs** are signatures from Zama's KMS that prove correct decryption
- The contract verifies these proofs via `FHE.checkSignatures()`
- Operations may fail with 5xx errors during high load - implement retry logic

---

## Events Reference

| Event            | Arguments                                                       | When Emitted                                     |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `GameStarted`    | `gameId` (indexed), `player1` (indexed), `stake`, `moveTimeout` | New game created                                 |
| `PlayerJoined`   | `gameId` (indexed), `player2` (indexed)                         | Player 2 joins                                   |
| `MoveSubmitted`  | `gameId` (indexed), `player` (indexed)                          | Move encrypted and submitted                     |
| `MoveInvalid`    | `gameId` (indexed), `player` (indexed)                          | Move validation failed (resubmit needed)         |
| `MoveMade`       | `gameId` (indexed), `player` (indexed)                          | Move validated successfully                      |
| `MovesProcessed` | `gameId` (indexed)                                              | Both moves processed, ready for round resolution |
| `Collision`      | `gameId` (indexed)                                              | Both players chose same cell                     |
| `GameUpdated`    | `gameId` (indexed), `winner`                                    | Round resolved (winner may still be None)        |
| `BoardRevealed`  | `gameId` (indexed)                                              | Board decrypted and stored                       |
| `GameCancelled`  | `gameId` (indexed)                                              | Game cancelled by player1 before player2 joined  |
| `GameTimeout`    | `gameId` (indexed), `winner` (indexed)                          | Timeout claimed, game ended                      |

### Event Listening Example

```typescript
// ethers.js v6
contract.on("MoveSubmitted", (gameId, player, event) => {
  console.log(`Move submitted in game ${gameId} by ${player}`);
});

// viem
const unwatch = publicClient.watchContractEvent({
  address: contractAddress,
  abi: SIMPHANTOE_ABI,
  eventName: "MovesProcessed",
  onLogs: (logs) => {
    logs.forEach((log) => {
      console.log(`Moves processed for game ${log.args.gameId}`);
    });
  },
});
```

---

## Error Handling

### Contract Revert Messages

| Error Message                          | Cause                                               |
| -------------------------------------- | --------------------------------------------------- |
| `"Game not found."`                    | Invalid game ID                                     |
| `"Game is already full."`              | Trying to join a game that has 2 players            |
| `"Cannot join your own game."`         | Player1 trying to join their own game               |
| `"Must match stake."`                  | Joining with wrong ETH amount                       |
| `"Invalid timeout."`                   | Timeout outside MIN_TIMEOUT (1h) / MAX_TIMEOUT (7d) |
| `"Game has not started yet."`          | Trying to submit move before player2 joins          |
| `"Game is finished."`                  | Trying to play in a finished game                   |
| `"You are not a player in this game."` | Non-participant trying to submit move               |
| `"Move already submitted."`            | Trying to submit when already submitted this round  |
| `"Game is not finished."`              | Trying to reveal board before game ends             |
| `"Game already finished."`             | Trying to finalize game state twice                 |
| `"Only player1 can cancel."`           | Non-player1 trying to cancel                        |
| `"Game already has player2."`          | Trying to cancel after opponent joined              |
| `"Timeout not reached."`               | Trying to claim timeout before deadline             |
| `"Game not started or full."`          | Trying to claim timeout on invalid game             |

### FHE/Relayer Errors

| Error Code | Meaning               | Action                         |
| ---------- | --------------------- | ------------------------------ |
| 500        | Internal server error | Retry after delay              |
| 502        | Bad gateway           | Retry after delay              |
| 503        | Service unavailable   | Retry after longer delay       |
| 504        | Gateway timeout       | Retry with exponential backoff |
| 520        | Unknown error         | Log and retry                  |

### Retry Strategy

```typescript
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, baseDelay = 2000): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}
```

---

## Strategy Considerations

### For an AI Agent Playing the Game

1. **Move Selection**:
   - Track your own moves locally (you know where you've played)
   - You cannot see opponent's moves until game ends
   - Consider probability - opponent may have played anywhere you haven't
2. **Collision Avoidance**:
   - After a collision, both players must pick again
   - The opponent might try the same cell again, or move elsewhere
   - Game theory applies - mix strategies to be unpredictable

3. **Win Condition Tracking**:
   - Need 4 in a row on 4x4 board (row, column, or diagonal)
   - 2 diagonals: (0,0)→(3,3) and (0,3)→(3,0)
   - Track potential winning lines based on your moves

4. **Board Coordinates**:

   ```
   Board Layout:
   (0,0) (1,0) (2,0) (3,0)   ← y=0
   (0,1) (1,1) (2,1) (3,1)   ← y=1
   (0,2) (1,2) (2,2) (3,2)   ← y=2
   (0,3) (1,3) (2,3) (3,3)   ← y=3
     ↑     ↑     ↑     ↑
    x=0   x=1   x=2   x=3
   ```

5. **Game State Monitoring**:
   - Poll `getMoves()` to check opponent's submission status
   - Listen to events for real-time updates
   - `canSubmitMove()` tells you if you can play

### Agent Loop Pseudocode

```
while game_not_over:
    # 1. Check if we need to submit a move
    if canSubmitMove(gameId, ourAddress):
        move = selectBestMove(knownBoard, ourMoves)
        encryptedMove = encrypt(move.x, move.y)
        submitMove(gameId, encryptedMove)

    # 2. Check if our move needs finalizing
    ourMove = getMoves(gameId)[ourIndex]
    if ourMove.isSubmitted and not ourMove.isMade:
        decrypted = publicDecrypt([ourMove.isInvalid])
        finalizeMove(gameId, ourAddress, decrypted)

        if decrypted.isInvalid:
            # Our move was invalid, try again
            continue

    # 3. Check if round needs resolving
    game = getGame(gameId)
    if bothMovesMade and game.eWinner != 0:
        decrypted = publicDecrypt([game.eWinner, game.eCollision])
        finalizeGameState(gameId, decrypted)

        if collision:
            # Reset for new move
            continue

        if winner != 0:
            # Game over!
            revealBoard(gameId)
            break

    # 4. Wait for opponent or next state change
    wait()
```

---

## Appendix: Full ABI

See `frontend/simphantoe/src/lib/contracts.ts` for the complete contract ABI.

## Appendix: Example Integration

For a complete example of frontend integration, see:

- `frontend/simphantoe/src/hooks/useSimPhanToe.ts` - React hooks for all game operations
- `frontend/simphantoe/src/lib/fhe.tsx` - FHE SDK wrapper
- `test/SimPhanToe.ts` - Comprehensive test suite showing all interactions
