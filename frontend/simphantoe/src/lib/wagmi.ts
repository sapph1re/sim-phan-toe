import { http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
  rabbyWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";

// Use environment variable for Sepolia RPC, fallback to public RPCs
// Public RPCs from chainlist - no API key required
export const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const SEPOLIA_CHAIN_ID = sepolia.id;

export const projectId = "23c5ccb50cba2e0c75fad37a91a9a16c"; // WalletConnect Cloud project ID

// Custom wallet list that excludes Coinbase Wallet to avoid analytics errors
// Used by RainbowKit when user chooses external wallet option
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [metaMaskWallet, rabbyWallet, rainbowWallet],
    },
    {
      groupName: "Other",
      wallets: [walletConnectWallet, injectedWallet],
    },
  ],
  {
    appName: "SimPhanToe",
    projectId,
  },
);

// Wagmi config used with RainbowKit for external wallets
// Set pollingInterval to 10 seconds to reduce RPC spam (default is ~4 seconds)
// This affects useWatchContractEvent and other polling operations
export const config = createConfig({
  connectors,
  chains: [sepolia],
  pollingInterval: 10_000, // 10 seconds - reduces event watching frequency
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL, {
      batch: true, // Batch multiple RPC calls into single requests
    }),
  },
});

// Chains array for Privy's wagmi adapter
export const chains = [sepolia] as const;

// Transport configuration for Privy's wagmi adapter
export const transports = {
  [sepolia.id]: http(SEPOLIA_RPC_URL, {
    batch: true, // Batch multiple RPC calls into single requests
  }),
};

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
