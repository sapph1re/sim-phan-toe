# SimPhanToe AI Agent

An autonomous AI agent that plays SimPhanToe (Simultaneous Phantom Tic-Tac-Toe) on Sepolia testnet using LangGraph and OpenAI GPT-4.

## Overview

This agent uses:
- **LangGraph** - State machine to model the game lifecycle
- **OpenAI GPT-4** - Strategic move selection with game theory reasoning
- **Zama FHE SDK** - Encryption/decryption for the phantom game mechanics
- **viem** - Ethereum contract interactions

## Prerequisites

- Node.js v20+ (v22+ recommended for FHE SDK)
- Sepolia ETH for gas fees
- OpenAI API key
- Sepolia RPC URL (Alchemy, Infura, etc.)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `PRIVATE_KEY` - Agent wallet private key (with Sepolia ETH)
- `SIMPHANTOE_ADDRESS` - Contract address (default: `0x52507f480444c844b1AB304f4Cbc5fED6077E8f0`)
- `SEPOLIA_RPC_URL` - Sepolia RPC endpoint

Optional:
- `POLL_INTERVAL` - Polling interval in ms (default: 5000)
- `LOG_LEVEL` - Log level: debug, info, warn, error (default: info)

## Usage

### Commands

```bash
# Show agent wallet address
npx tsx src/index.ts wallet

# Check agent's ETH balance
npx tsx src/index.ts balance

# Find and join an open game
npm run find-game
# or: npx tsx src/index.ts find-game

# Join a specific game by ID
npx tsx src/index.ts join-game <gameId>

# Create a new game and wait for opponent
npm run create-game
# or: npx tsx src/index.ts create-game

# Resume playing an existing game
npx tsx src/index.ts play <gameId>

# List your games
npx tsx src/index.ts list-games

# Check game status
npx tsx src/index.ts status <gameId>
```

### Example Session

```bash
# Terminal 1: Create a game as the agent
npx tsx src/index.ts create-game

# Terminal 2 (or another player): Join the game
# The agent will automatically play once an opponent joins
```

## Architecture

```
src/
├── index.ts           # CLI entry point
├── graph.ts           # LangGraph state machine
├── state.ts           # State types and annotations
├── nodes/             # Graph node implementations
│   ├── checkGameState.ts
│   ├── selectMove.ts      # LLM-powered move selection
│   ├── submitMove.ts
│   ├── finalizeMove.ts
│   ├── finalizeGameState.ts
│   ├── revealBoard.ts
│   └── waitForOpponent.ts
├── services/
│   ├── contract.ts    # Contract interactions
│   └── fhe.ts         # FHE encryption/decryption
└── utils/
    ├── logger.ts      # Structured logging
    └── retry.ts       # Exponential backoff
```

## Game Flow

1. **Idle** → Agent is assigned a game
2. **WaitingForOpponent** → Polling until player 2 joins
3. **SelectingMove** → GPT-4 chooses optimal cell
4. **SubmittingMove** → Encrypt and submit move
5. **FinalizingMove** → Decrypt validity, finalize on-chain
6. **WaitingForOpponentMove** → Polling for opponent
7. **FinalizingGameState** → Decrypt winner/collision
8. **RevealingBoard** → Decrypt and reveal final board (if game over)
9. **GameComplete** → Display results

## Strategy

The agent uses GPT-4 to make strategic decisions:
- Tracks its own moves (opponent moves are hidden)
- Considers center and corner positions
- Avoids predictable patterns to reduce collisions
- Adapts strategy based on collision history

## Development

```bash
# Type check
npx tsc --noEmit

# Build
npm run build

# Run with debug logging
LOG_LEVEL=debug npx tsx src/index.ts play <gameId>
```

## License

MIT

