/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_VIEW?: string;
  readonly VITE_MESSAGING_ONLY?: string;
  readonly VITE_API_ENDPOINT?: string;
  readonly VITE_PN_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
