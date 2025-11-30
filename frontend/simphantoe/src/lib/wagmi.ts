import { http } from 'wagmi'
import { hardhat, sepolia } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'

// Custom Hardhat chain config to ensure correct settings
const localhost = {
  ...hardhat,
  id: 31337,
  name: 'Localhost',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
} as const

export const config = getDefaultConfig({
  appName: 'SimPhanToe',
  projectId: 'simphantoe-dev', // For WalletConnect - use a real one in production
  chains: [localhost, sepolia],
  transports: {
    [localhost.id]: http('http://127.0.0.1:8545'),
    [sepolia.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

