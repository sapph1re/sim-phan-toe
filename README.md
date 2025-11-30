# Sim Phan Toe

Simultaneous Phantom Tic-Tac-Toe game with FHEVM

A twist on the classic game where both players make their moves **simultaneously**. No first-mover advantage. Opponent's
moves are encrypted and hidden.

## Demo

https://simphantoe.netlify.app/

Deployed contract address in Sepolia: 0xda70dc4AA88DEcD0edE470c3481b67D0D8c0B03F

## Game Rules

1. **Simultaneous Moves**: Both players select their cell at the same time. Your opponent can't see your choice!
2. **Collision = No Move**: If both players pick the same cell, neither move counts. Pick again!
3. **Win Conditions**: Get three in a row, column, or diagonal. If both complete a line simultaneously, it's a draw!

### Phantom Mode

- Your moves are encrypted using Fully Homomorphic Encryption (FHE)
- You can only see your own moves throughout the game
- Opponent's positions remain hidden

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
├── contracts/                # Solidity smart contracts
│   ├── SimTacToe.sol         # Unencrypted simultaneous tic-tac-toe
│   └── SimPhanToe.sol        # FHE encrypted phantom tic-tac-toe
├── deploy/                   # Deployment scripts
│   ├── 001_deploy_SimTacToe.ts
│   └── 002_deploy_SimPhanToe.ts
├── frontend/                 # Frontend applications
│   ├── simtactoe/            # SimTacToe frontend (unencrypted)
│   │   ├── src/
│   │   │   ├── components/   # UI components
│   │   │   ├── hooks/        # React hooks for contract interaction
│   │   │   └── lib/          # Wagmi config and contract ABI
│   │   ├── package.json
│   │   └── vite.config.ts
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

Note: **SimTacToe** is an unencrypted version of the game where all moves are visible. As a game it doesn't really make
sense on its own, but its development was a preparatory step before the encrypted version.

## Available Scripts

| Script                                | Description                              |
| ------------------------------------- | ---------------------------------------- |
| `npm run compile`                     | Compile smart contracts                  |
| `npm run test`                        | Run contract tests                       |
| `npm run dev:simtactoe`               | Start SimTacToe frontend dev server      |
| `npm run dev:simphantoe`              | Start SimPhanToe frontend dev server     |
| `npm run build:simtactoe`             | Build SimTacToe frontend for production  |
| `npm run build:simphantoe`            | Build SimPhanToe frontend for production |
| `npm run deploy:localhost`            | Deploy all contracts to local network    |
| `npm run deploy:sepolia`              | Deploy all contracts to Sepolia testnet  |
| `npm run deploy:simtactoe:localhost`  | Deploy only SimTacToe to local network   |
| `npm run deploy:simphantoe:localhost` | Deploy only SimPhanToe to local network  |
| `npm run deploy:simtactoe:sepolia`    | Deploy only SimTacToe to Sepolia         |
| `npm run deploy:simphantoe:sepolia`   | Deploy only SimPhanToe to Sepolia        |

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

## License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.
