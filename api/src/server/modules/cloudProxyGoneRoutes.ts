/**
 * Retired cloud proxies. The API never reads or writes a user's cloud, for the
 * owner or for third parties. Integrators receive what the user shares as
 * granted ZK data points; files stay between the user's device and their cloud.
 */

import type express from 'express';

const RETIRED_PATHS = ['/api/drive', '/api/drive/*', '/api/integrator/storage-root'];

export function setupCloudProxyGoneRoutes(app: express.Application): void {
  const gone: express.RequestHandler = (_req, res) => {
    res.status(410).json({
      error: 'gone',
      error_description:
        'The par Noir API no longer proxies user cloud storage. Use granted data points (/oauth/zkp-data-points).',
    });
  };
  for (const path of RETIRED_PATHS) app.all(path, gone);
}
