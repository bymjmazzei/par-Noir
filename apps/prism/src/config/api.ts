/** Single default in this module; override with VITE_API_ENDPOINT for non-production API hosts. */
const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
export const API_ENDPOINT = (envEndpoint && String(envEndpoint).trim()) || 'https://api.parnoir.com';
