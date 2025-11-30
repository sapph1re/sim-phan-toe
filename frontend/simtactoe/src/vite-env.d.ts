/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIMTACTOE_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

