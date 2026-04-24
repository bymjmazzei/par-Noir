const raw = import.meta.env.VITE_PN_CLIENT_ID && String(import.meta.env.VITE_PN_CLIENT_ID).trim();
/** OAuth client seeded as licensing-portal (see api clientRegistration). */
export const PN_CLIENT_ID =
  raw && raw !== 'browser-app' ? raw : 'licensing-portal';
