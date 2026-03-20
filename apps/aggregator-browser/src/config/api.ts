/** Single default lives here; override with VITE_API_ENDPOINT in .env when pointing at another host. */
const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
export const API_ENDPOINT = (envEndpoint && String(envEndpoint).trim()) || 'https://api.parnoir.com';
