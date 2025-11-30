import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Required for @zama-fhe/relayer-sdk
    global: "globalThis",
  },
  server: {
    // Required headers for FHE SDK (SharedArrayBuffer/threads support)
    // See: https://docs.zama.org/protocol/relayer-sdk-guides/development-guide
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    // Same headers for preview server
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
