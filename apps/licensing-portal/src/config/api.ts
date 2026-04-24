const env = import.meta.env.VITE_API_ENDPOINT;
if (import.meta.env.PROD && (!env || String(env).trim() === '')) {
  throw new Error('VITE_API_ENDPOINT is required in production. Set it in your environment or .env.');
}
const DEV_API_DEFAULT = 'http://127.0.0.1:3001';
export const API_ENDPOINT = (env && String(env).trim()) || (import.meta.env.DEV ? DEV_API_DEFAULT : '');
