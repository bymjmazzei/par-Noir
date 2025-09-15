/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPFS_HOST?: string;
  readonly VITE_IPFS_PORT?: string;
  readonly VITE_IPFS_PROTOCOL?: string;
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_IPFS_API_KEY?: string;
  readonly VITE_IPFS_TIMEOUT?: string;
  readonly VITE_IPFS_MODE?: string;
  readonly DEV?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
