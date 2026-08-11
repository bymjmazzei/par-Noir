import type express from 'express';

/**
 * GET navigations to API-hosted OAuth HTML do not send an Origin header.
 * Allow those in production no-Origin checks without weakening CORS for state-changing API calls.
 *
 * `/oauth/popup-bridge` remains listed so deprecated GETs (no Origin) reach the 410 handler.
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

/**
 * Consent HTML on the API host uses same-origin fetch() for grant poll + catalog.
 * Browsers omit Origin on those GETs; Sec-Fetch-Site: same-origin distinguishes them
 * from cross-site no-Origin probes without opening state-changing routes.
 */
export function isOAuthConsentSameOriginGet(req: express.Request): boolean {
  if (req.method !== 'GET') return false;
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (site !== 'same-origin') return false;
  const path = req.path || req.url?.split('?')[0] || '';
  return (
    path === '/oauth/existing-grant' || path === '/api/v1/standard-data-points'
  );
}
