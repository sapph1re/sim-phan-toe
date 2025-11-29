# Sim Phan Toe

Simultaneous Phantom Tic-Tac-Toe game with FHEVM

A twist on the classic game where both players make their moves **simultaneously**. No more first-mover advantage — pure
strategy and prediction.

## Game Rules

1. **Simultaneous Moves**: Both players select their cell at the same time. Your opponent can't see your choice!
2. **Collision = No Move**: If both players pick the same cell, neither move counts. Pick again!
3. **Win Conditions**: Get three in a row, column, or diagonal. If both complete a line simultaneously, it's a draw!

## Prerequisites

- **Node.js**: Version 20 or higher
- **npm**: Version 7 or higher
- **MetaMask**: Browser wallet extension

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

### 4. Deploy to Local Network

In one terminal, start the local Hardhat node:

```bash
npx hardhat node
```

In another terminal, deploy the contracts:

```bash
npx hardhat deploy --network localhost
```

Note the deployed contract address from the output.

### 5. Configure Frontend

Create the frontend environment file:

```bash
echo "VITE_SIMTACTOE_ADDRESS=<YOUR_CONTRACT_ADDRESS>" > frontend/.env
```

Replace `<YOUR_CONTRACT_ADDRESS>` with the address from step 4.

### 6. Run Frontend

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 7. Connect MetaMask

1. Add the local Hardhat network to MetaMask:
   - Network Name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency Symbol: `ETH`

2. Import a test account using one of the private keys from the Hardhat node output.

3. Connect your wallet in the game UI and start playing!

## Deploy to Sepolia Testnet

```bash
# Deploy to Sepolia
npx hardhat deploy --network sepolia

# Verify contract on Etherscan
npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
```

## Project Structure

```
/
├── contracts/           # Solidity smart contracts
│   ├── SimTacToe.sol    # Unencrypted version (current)
│   └── SimPhanToe.sol   # FHE encrypted version (in development)
├── deploy/              # Deployment scripts
├── frontend/            # React frontend application
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── hooks/       # React hooks for contract interaction
│   │   └── lib/         # Wagmi config and contract ABI
│   └── ...
├── tasks/               # Hardhat custom tasks
├── test/                # Contract tests
├── hardhat.config.ts    # Hardhat configuration
└── package.json         # Dependencies and scripts
```

## Available Scripts

| Script                     | Description               |
| -------------------------- | ------------------------- |
| `npm run compile`          | Compile smart contracts   |
| `npm run test`             | Run contract tests        |
| `npm run dev`              | Start frontend dev server |
| `npm run deploy:localhost` | Deploy to local network   |
| `npm run deploy:sepolia`   | Deploy to Sepolia testnet |

## Technology Stack

**Smart Contracts**

- Solidity 0.8.27
- Hardhat
- FHEVM (for encrypted version)

**Frontend**

- React 18
- Vite
- TypeScript
- Tailwind CSS
- wagmi + viem
- RainbowKit

## License

This project is licensed under the BSD-3-Clause-Clear License. See the [LICENSE](LICENSE) file for details.
