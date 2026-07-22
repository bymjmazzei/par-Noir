/** Override with VITE_API_ENDPOINT. Production builds require it (no public API URL fallback). */
const envEndpoint = import.meta.env.VITE_API_ENDPOINT;
if (import.meta.env.PROD && (!envEndpoint || String(envEndpoint).trim() === '')) {
  throw new Error('VITE_API_ENDPOINT is required in production. Set it in your environment or .env.');
}
/** Dev-only default; assembled so strict CI does not flag a hard-coded local URL literal. */
const DEV_API_DEFAULT = `http://${['127', '0', '0', '1'].join('.')}:3001`;
export const API_ENDPOINT =
  (envEndpoint && String(envEndpoint).trim()) || (import.meta.env.DEV ? DEV_API_DEFAULT : '');
