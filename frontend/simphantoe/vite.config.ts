import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Required for @zama-fhe/relayer-sdk
    global: "globalThis",
  },
  // Note: COOP/COEP headers are NOT set because:
  // 1. FHE SDK uses thread: 0 (single-threaded mode, no SharedArrayBuffer needed)
  // 2. Privy embedded wallets require iframes that break with strict COOP/COEP
});
