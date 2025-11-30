/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIMPHANTOE_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
