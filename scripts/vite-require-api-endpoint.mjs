/**
 * Fail `vite build` when VITE_API_ENDPOINT is missing.
 * Runtime checks in each app's config/api.ts only run after deploy — too late for operators.
 */
import { loadEnv } from 'vite';

const DEFAULT_HINT =
  'Set VITE_API_ENDPOINT in the shell or app .env (e.g. https://api.parnoir.com). From repo root: ./deploy.sh';

export function assertViteApiEndpointForBuild({ command, mode, root }) {
  if (command !== 'build') return;

  const env = loadEnv(mode, root, '');
  const endpoint = String(env.VITE_API_ENDPOINT ?? process.env.VITE_API_ENDPOINT ?? '').trim();
  if (!endpoint) {
    throw new Error(`VITE_API_ENDPOINT is required for production builds (vite ${command} --mode ${mode}). ${DEFAULT_HINT}`);
  }
}
