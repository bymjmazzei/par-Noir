const raw = import.meta.env.VITE_PN_CLIENT_ID && String(import.meta.env.VITE_PN_CLIENT_ID).trim();
/** Registered OAuth client for this site (seeded on API as developer-portal). */
export const PN_CLIENT_ID =
  raw && raw !== 'browser-app' ? raw : 'developer-portal';
