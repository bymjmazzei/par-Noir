import type { Application } from 'express';

export function registerCoreRoutes(app: Application, nodeEnv: string): void {
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: nodeEnv
    });
  });

  app.get('/health/ready', async (_req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.json({
        ready: true,
        database: 'not_configured',
        timestamp: new Date().toISOString()
      });
    }
    try {
      const { getDatabasePool } = await import('../utils/database');
      const pool = getDatabasePool();
      await pool.query('SELECT 1');
      return res.json({
        ready: true,
        database: 'ok',
        timestamp: new Date().toISOString()
      });
    } catch {
      return res.status(503).json({
        ready: false,
        database: 'unavailable',
        timestamp: new Date().toISOString()
      });
    }
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      service: 'Identity Protocol API',
      version: '1.0.0',
      status: 'operational',
      timestamp: new Date().toISOString()
    });
  });

  app.get('/api/public-config', (_req, res) => {
    res.json({
      googleDriveClientId: process.env.GOOGLE_DRIVE_CLIENT_ID || '',
      dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
      microsoftClientId: process.env.MICROSOFT_CLIENT_ID || ''
    });
  });

  if (nodeEnv === 'development') {
    app.get('/api/debug/oauth-config', (_req, res) => {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
      const hasClientSecret = !!process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const clientSecretLength = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.length || 0;

      res.json({
        hasClientId: !!clientId,
        clientId: clientId,
        hasClientSecret: hasClientSecret,
        clientSecretLength: clientSecretLength,
        clientSecretFirstChars: process.env.GOOGLE_DRIVE_CLIENT_SECRET
          ? process.env.GOOGLE_DRIVE_CLIENT_SECRET.substring(0, 4) + '...'
          : 'MISSING',
        environment: nodeEnv
      });
    });
  }
}

