const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
if (import.meta.env.PROD && (!envEndpoint || String(envEndpoint).trim() === '')) {
  throw new Error('VITE_API_ENDPOINT is required in production. Set it in your environment or .env.');
}
/** Dev default points at local API; production never uses this (throws above if unset). */
const DEV_API_DEFAULT = 'http://127.0.0.1:3001';
export const API_ENDPOINT =
  (envEndpoint && String(envEndpoint).trim()) || (import.meta.env.DEV ? DEV_API_DEFAULT : '');
