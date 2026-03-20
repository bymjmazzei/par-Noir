/**
 * Build-time flags from Vite env (set in .env.* for modes like messaging).
 */
export const MESSAGING_ONLY = import.meta.env.VITE_MESSAGING_ONLY === 'true';
