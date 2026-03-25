/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_VIEW?: string;
  readonly VITE_MESSAGING_ONLY?: string;
  readonly VITE_API_ENDPOINT?: string;
  readonly VITE_PN_CLIENT_ID?: string;
  /** Optional Sentry DSN; production only (see src/config/sentry.ts) */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
