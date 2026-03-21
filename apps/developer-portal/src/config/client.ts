const id = import.meta.env.VITE_PN_CLIENT_ID;
/** Registered OAuth client for this site (seeded on API as developer-portal). */
export const PN_CLIENT_ID = (id && String(id).trim()) || 'developer-portal';
