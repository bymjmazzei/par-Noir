const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
if (import.meta.env.PROD && (!envEndpoint || String(envEndpoint).trim() === '')) {
  throw new Error('VITE_API_ENDPOINT is required in production.');
}
const DEV_API_DEFAULT = 'http://127.0.0.1:3001';
export const API_ENDPOINT =
  (envEndpoint && String(envEndpoint).trim()) || (import.meta.env.DEV ? DEV_API_DEFAULT : '');

export const PN_CLIENT_ID = import.meta.env.VITE_PN_CLIENT_ID || 'pen-app';
