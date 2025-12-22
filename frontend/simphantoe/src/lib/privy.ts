import { sepolia } from "viem/chains";
import type { PrivyClientConfig } from "@privy-io/react-auth";

// Privy App ID from environment
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID || "";

// Check if Privy is configured
export const isPrivyConfigured = Boolean(PRIVY_APP_ID && PRIVY_APP_ID !== "your-privy-app-id");

// Privy configuration for embedded wallets
export const privyConfig: PrivyClientConfig = {
  // Appearance customization to match the app theme
  appearance: {
    theme: "dark",
    accentColor: "#a855f7", // cyber-purple
    logo: undefined, // Will use default
    showWalletLoginFirst: false, // Show email first
  },

  // Login methods - email is primary, wallet is secondary
  loginMethods: ["email", "wallet"],

  // Embedded wallet configuration
  embeddedWallets: {
    // Automatically create embedded wallet for users who sign in with email
    ethereum: {
      createOnLogin: "users-without-wallets",
    },
  },

  // Default chain configuration
  defaultChain: sepolia,
  supportedChains: [sepolia],
};
