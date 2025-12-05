import { http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// Use environment variable for Sepolia RPC, fallback to public RPCs
// Public RPCs from chainlist - no API key required
const SEPOLIA_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

export const SEPOLIA_CHAIN_ID = sepolia.id;

export const config = getDefaultConfig({
  appName: "SimPhanToe",
  projectId: "23c5ccb50cba2e0c75fad37a91a9a16c", // WalletConnect Cloud project ID
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
