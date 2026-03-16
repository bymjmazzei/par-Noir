const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
if (import.meta.env.PROD && (!envEndpoint || String(envEndpoint).trim() === '')) {
  throw new Error('VITE_API_ENDPOINT is required in production. Set it in your environment or .env.');
}
export const API_ENDPOINT = envEndpoint?.trim() || 'https://api.parnoir.com';
