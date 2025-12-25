# SimPhanToe AI Agent

An autonomous AI agent that plays SimPhanToe (Simultaneous Phantom Tic-Tac-Toe) on Sepolia testnet using LangGraph and
OpenAI GPT-4.

## Overview

This agent uses:

- **LangGraph** - State machine to model the game lifecycle
- **OpenAI GPT-4** - Strategic move selection with game theory reasoning
- **Zama FHE SDK** - Encryption/decryption for the phantom game mechanics
- **viem** - Ethereum contract interactions
- **PostgreSQL** - Persistent state tracking across restarts

### Key Features

- **Multi-game orchestration** - Manages multiple games simultaneously in round-robin fashion
- **Dual game creation** - Maintains one free game and one 0.01 ETH staked game for opponents
- **Balance-aware** - Only creates paid games when wallet balance is sufficient
- **Automatic timeout claims** - Detects and claims victory when opponents time out
- **Persistent state** - PostgreSQL database tracks game state across restarts
- **Event-driven** - WebSocket subscriptions with polling fallback for real-time updates

## Prerequisites

- Node.js v20+ (v22+ recommended for FHE SDK)
- PostgreSQL database
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

### Environment Variables

**Required:**

| Variable             | Description                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `OPENAI_API_KEY`     | Your OpenAI API key                                                      |
| `PRIVATE_KEY`        | Agent wallet private key (with Sepolia ETH)                              |
| `SIMPHANTOE_ADDRESS` | Contract address (default: `0xF72E2d02476cAcbcE01c164da33858C49Fa55036`) |
| `SEPOLIA_RPC_URL`    | Sepolia RPC endpoint                                                     |
| `POSTGRES_HOST`      | PostgreSQL host                                                          |
| `POSTGRES_PORT`      | PostgreSQL port (default: 5432)                                          |
| `POSTGRES_DATABASE`  | Database name                                                            |
| `POSTGRES_USER`      | Database user                                                            |
| `POSTGRES_PASSWORD`  | Database password                                                        |

**Optional:**

| Variable         | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `OPENAI_MODEL`   | Model to use (default: `gpt-4-turbo-preview`)                         |
| `SEPOLIA_WS_URL` | WebSocket URL for real-time events (auto-derived from RPC if not set) |
| `LOG_LEVEL`      | Log level: `debug`, `info`, `warn`, `error` (default: `info`)         |

3. Initialize the database:

```bash
npm run db-init
```

## Usage

Run the orchestrator:

```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The orchestrator will:

- Sync existing games from the blockchain
- Create and maintain open games for new opponents
- Process all active games in round-robin fashion
- Automatically claim timeouts when opponents are inactive

## Architecture

```
src/
├── index.ts           # CLI entry point
├── orchestrator.ts    # Multi-game orchestrator
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
├── persistence/       # Database layer
│   ├── db.ts          # PostgreSQL connection
│   └── gameStore.ts   # Game state CRUD operations
├── services/
│   ├── contract.ts    # Contract interactions
│   ├── events.ts      # Event watching (WebSocket + polling)
│   └── fhe.ts         # FHE encryption/decryption
└── utils/
    ├── logger.ts      # Structured logging
    └── retry.ts       # Exponential backoff
```

## Game Flow

1. **Idle** → Agent is assigned a game
2. **WaitingForOpponent** → Waiting for player 2 to join
3. **SelectingMove** → GPT-4 chooses optimal cell
4. **SubmittingMove** → Encrypt and submit move
5. **FinalizingMove** → Decrypt validity, finalize on-chain
6. **WaitingForOpponentMove** → Waiting for opponent (monitors timeout)
7. **FinalizingGameState** → Decrypt winner/collision
8. **RevealingBoard** → Decrypt and reveal final board (if game over)
9. **GameComplete** → Game finished

### Timeout Handling

The agent automatically monitors move timeouts:

- When waiting for opponent's move, checks if timeout has elapsed
- Claims victory automatically if opponent times out
- Games default to 24-hour move timeout

## Strategy

The agent uses GPT-4 to make strategic decisions:

- Tracks its own moves (opponent moves are hidden in phantom mode)
- Considers center and corner positions as strategically valuable
- Avoids predictable patterns to reduce collisions
- Adapts strategy based on collision history

### Game Creation Behavior

The orchestrator maintains two open games:

- **Free game** (no stake) - Always available
- **Paid game** (0.01 ETH stake) - Created when wallet balance ≥ 0.015 ETH

Both games use a **24-hour move timeout**.

## Development

```bash
# Type check
npx tsc --noEmit

# Build
npm run build

# Run with debug logging
LOG_LEVEL=debug npm run dev
```

## License

MIT
