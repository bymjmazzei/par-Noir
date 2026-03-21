const env = import.meta.env.VITE_API_ENDPOINT;
export const API_ENDPOINT = (env && String(env).trim()) || 'https://api.parnoir.com';
