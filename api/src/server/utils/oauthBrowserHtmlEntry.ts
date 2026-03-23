import type express from 'express';

/**
 * GET navigations to API-hosted OAuth HTML do not send an Origin header.
 * Allow those in production no-Origin checks without weakening CORS for state-changing API calls.
 *
 * Includes `/oauth/popup-bridge` — popup redirects here after consent so the bridge script
 * can postMessage / navigate the opener before the window closes.
 */
export function isOAuthBrowserHtmlEntryGet(req: express.Request): boolean {
  if (req.method !== 'GET') return false;
  const path = req.path || req.url?.split('?')[0] || '';
  return (
    path.startsWith('/oauth/authorize/consent') ||
    path.startsWith('/oauth/consent') ||
    path.startsWith('/oauth/popup-bridge')
  );
}
