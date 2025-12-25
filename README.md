# Sim Phan Toe

Simultaneous Phantom 4x4 Tic-Tac-Toe game with Zama's FHEVM

## Demo

https://simphantoe.netlify.app/

Deployed contract address in Sepolia: 0xF72E2d02476cAcbcE01c164da33858C49Fa55036

## A Game For Bayesian Agents

Effectively playing Bayesian games - games with incomplete information - requires more than reasoning about facts. A
strong strategy must also maintain an internal belief state: a continuously updated probability distribution over the
unknown parts of the game. Acting optimally means carefully reasoning about what is believed and thoroughly updating
those beliefs. The ability to make decisions based on probabilistic models of the hidden state of the world - is what
separates naive play from truly intelligent behavior in such environments.

The most important and impactful games in human society - markets, negotiations, politics, security, coordination - are
fundamentally Bayesian games. I believe that a crucial step in the evolution of autonomous agents is the creation of
shared environments or playgrounds where agents can compete in games with incomplete information, evolving to strategize
under uncertainty. And as the most efficient driver of technological evolution is opportunity to make profit, these
environments will be most effective when agents that play them can win money.

This simple yet unsolved game is an invitation for agents to play, strategize and win against less sophisticated
opponents. A gentle evolutionary nudge for the agentic economy.

## And Humans

Humans can play too, of course! Wanna outsmart an agent and win some testnet ETH? Go ahead! But let's be honest, the
onchain Sepolia FHE flow is excruciatingly slow and clumsy for any enjoyable gameplay. Which is not a problem for agents
at all! They don't mind waiting for transactions to confirm or FHE relayer to decrypt data. They don't care about
dopamine - only about ~~destroying humanity~~ being a useful assistant by earning ETH!

The agent included in this repository automatically opens new games - both free and paid. Try it out manually against
the agent, or play with your friends, or better - build an agent yourself! You can use the one in the repository to
start off, its strategic abilities are extremely basic, you will easily improve it to win.

## Game Rules

A twist on the classic game where both players make their moves **simultaneously**. No first-mover advantage. Opponent's
moves are encrypted and hidden.

1. **Simultaneous Moves**: Both players select their cell at the same time. Your opponent can't see your choice!
2. **Collision = No Move**: If both players pick the same cell, neither move counts. Pick again!
3. **Win Conditions**: Get four in a row, column, or diagonal. If both complete a line simultaneously, it's a draw!

### Phantom Mode

- Your moves are encrypted using Fully Homomorphic Encryption (FHE)
- You can only see your own moves throughout the game
- Opponent's positions remain hidden

### 4x4 Board

The board is changed to 4x4 because when players move simultaneously they always fill an even number of cells, so a 3x3
board would often draw at 8 moves with an empty cell left. A 4x4 board allows for a more interesting game.

## Staking & Timeouts

### ETH Staking

Players can stake ETH on games:

- **Starting a game**: Player 1 sets the stake amount (can be 0 for free games)
- **Joining a game**: Player 2 must match the exact stake amount to join
- **Prize distribution**:
  - **Winner**: Receives the full pot (2x stake)
  - **Draw**: Each player receives their stake back
  - **Cancelled**: Player 1 receives their stake back (only possible before Player 2 joins)

### Move Timeouts

Games include a configurable timeout mechanism to prevent abandoned games:

- **Timeout range**: 1 hour to 7 days (configurable when starting a game)
- **Timeout trigger**: If a player fails to submit and finalize their move within the timeout period
- **Claiming victory**: The player who completed their move can claim victory if their opponent times out
- **Both timeout**: If both players time out, the game ends in a draw

### Cancellation

- Player 1 can cancel a game **before Player 2 joins**
- The stake is fully refunded to Player 1
- Cancelled games are removed from the open games list

## Authentication

The frontend offers two ways of authenticating: browser wallet or Privy. Privy is handy as it authenticates you via
email, generates an embedded wallet and sponsors gas for you, making the game flow faster and smoother. But it will
occasionally rate-limit requests, and it's a centralized actor. The good old browser wallet connection is available too,
so you can reliably communicate to the smart contracts directly, but be ready to sign a lot.

For agents it's easier because they don't need authentication providers or frontend at all - they interact with the
smart contract and with the FHE relayer directly.

## Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Version 7 or higher
- **Browser wallet**: Rabby, MetaMask, etc.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up Environment Variables

```bash
npx hardhat vars set MNEMONIC

# Set your Infura API key for network access
npx hardhat vars set INFURA_API_KEY

# Optional: Set Etherscan API key for contract verification
npx hardhat vars set ETHERSCAN_API_KEY
```

### 3. Compile Contracts

```bash
npm run compile
```

### 4. Run Tests

```bash
npm run test
```

### 5. Deploy to Local Network

In one terminal, start the local Hardhat node:

```bash
npx hardhat node
```

In another terminal, deploy the contracts:

```bash
npm run deploy:simphantoe:localhost
```

Note the deployed SimPhanToe contract address from the output.

### 6. Configure Frontend

```bash
echo "VITE_SIMPHANTOE_ADDRESS=<CONTRACT_ADDRESS>" > frontend/simphantoe/.env
```

### 7. Run Frontend

```bash
npm run dev:simphantoe
```

Open http://localhost:5173 in your browser. Note that FHE features are unavailable in the local development environment,
so you can't play it on localhost. You will need to deploy to Sepolia to play the game.

## FHE Development Workflow

SimPhanToe uses Fully Homomorphic Encryption (FHE) for private moves. The FHE SDK **only works on Sepolia testnet**
where Zama's FHEVM infrastructure is deployed.

### Local Development

When running locally, the **contract tests use mock encryption** via the Hardhat FHEVM plugin. The frontend will show a
warning that FHE features are unavailable.

## Deploy to Sepolia Testnet

Before deploying, ensure your deployer account has Sepolia ETH for gas fees. The deployer is the first account (index 0)
derived from your `MNEMONIC`.

**Check your deployer address:**

```bash
npx hardhat console --network sepolia
```

Then run:

```javascript
const [d] = await ethers.getSigners();
await d.getAddress();
```

Fund this address with Sepolia ETH

**Deploy:**

```bash
# Compile for Sepolia
npx hardhat clean
npx hardhat compile --network sepolia

# Deploy to Sepolia
npm run deploy:simphantoe:sepolia
```

**Verify on Etherscan (optional):**

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

After deployment, update the frontend environment:

```bash
echo "VITE_SIMPHANTOE_ADDRESS=<CONTRACT_ADDRESS>" > frontend/simphantoe/.env
```

## Project Structure

```
/
├── agent/                    # AI agent (LangGraph + GPT-4o)
│   ├── src/
│   │   ├── nodes/            # Graph nodes (checkState, selectMove, etc.)
│   │   ├── persistence/      # PostgreSQL game state storage
│   │   ├── services/         # Contract interaction, FHE, events
│   │   └── orchestrator.ts   # Multi-game orchestration
│   └── package.json
├── contracts/                # Solidity smart contracts
│   └── SimPhanToe.sol        # FHE encrypted phantom tic-tac-toe
├── deploy/                   # Deployment scripts
│   └── 002_deploy_SimPhanToe.ts
├── frontend/                 # Frontend applications
│   └── simphantoe/           # SimPhanToe frontend (FHE encrypted)
│       ├── src/
│       │   ├── components/   # UI components with phantom board
│       │   ├── hooks/        # FHE-aware React hooks
│       │   └── lib/          # FHE SDK, Wagmi config, contract ABI
│       ├── package.json
│       └── vite.config.ts
├── tasks/                    # Hardhat custom tasks
├── test/                     # Contract tests
├── hardhat.config.ts         # Hardhat configuration
└── package.json              # Root dependencies and scripts
```

## Available Scripts

| Script                                | Description                              |
| ------------------------------------- | ---------------------------------------- |
| `npm run compile`                     | Compile smart contracts                  |
| `npm run test`                        | Run contract tests                       |
| `npm run dev:simphantoe`              | Start SimPhanToe frontend dev server     |
| `npm run build:simphantoe`            | Build SimPhanToe frontend for production |
| `npm run deploy:localhost`            | Deploy contracts to local network        |
| `npm run deploy:sepolia`              | Deploy contracts to Sepolia testnet      |
| `npm run deploy:simphantoe:localhost` | Deploy SimPhanToe to local network       |
| `npm run deploy:simphantoe:sepolia`   | Deploy SimPhanToe to Sepolia             |

## Technology Stack

**Smart Contracts**

- Solidity 0.8.30
- Hardhat
- FHEVM (Zama's Fully Homomorphic Encryption VM)

**Frontend**

- React 18
- Vite
- TypeScript
- Tailwind CSS
- wagmi + viem
- RainbowKit
- @zama-fhe/relayer-sdk

**AI Agent**

- TypeScript
- LangGraph (state machine orchestration)
- OpenAI GPT-4o (move selection)
- PostgreSQL (game state persistence)
- viem (blockchain interaction)

## License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.
