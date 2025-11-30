import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // Custom plugin to serve WASM files from node_modules with correct MIME type
    {
      name: "serve-wasm",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith(".wasm")) {
            // Try to serve from public folder first
            const publicPath = resolve(__dirname, "public", req.url.split("/").pop()!);
            if (existsSync(publicPath)) {
              res.setHeader("Content-Type", "application/wasm");
              res.end(readFileSync(publicPath));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  define: {
    // Required for @zama-fhe/relayer-sdk
    global: "globalThis",
  },
  resolve: {
    // Handle Node.js built-in modules
    alias: {
      // keccak uses readable-stream which needs buffer
      buffer: "buffer/",
    },
  },
  optimizeDeps: {
    // Force pre-bundle these CJS deps for proper ESM interop
    include: ["keccak", "keccak/js.js", "fetch-retry", "wasm-feature-detect"],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: "globalThis",
      },
    },
  },
  assetsInclude: ["**/*.wasm"],
  build: {
    // Handle CommonJS dependencies
    commonjsOptions: {
      transformMixedEsModules: true,
    },
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
  worker: {
    // Enable WASM in workers (needed for FHE SDK threads)
    plugins: () => [wasm(), topLevelAwait()],
  },
});
