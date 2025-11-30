import { http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Custom Hardhat chain config to ensure correct settings
const localhost = {
  ...hardhat,
  id: 31337,
  name: "Localhost",
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
} as const;

// Use environment variable for Sepolia RPC, fallback to public RPCs
// Public RPCs from chainlist - no API key required
const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://1rpc.io/sepolia";

export const config = getDefaultConfig({
  appName: "SimPhanToe",
  projectId: "23c5ccb50cba2e0c75fad37a91a9a16c", // WalletConnect Cloud project ID
  chains: [localhost, sepolia],
  transports: {
    [localhost.id]: http("http://127.0.0.1:8545"),
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
