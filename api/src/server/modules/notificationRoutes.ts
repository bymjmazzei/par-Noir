/**
 * Notification Routes
 * Notifications live in the owner's cloud and are read and written on the device.
 * The API only answers for the device-unlock alerts it keeps in the layout shell.
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

interface LayoutAlert {
  notification_id: string;
  read: boolean;
  [key: string]: unknown;
}

function layoutDeviceUnlockAlerts(credentials: Record<string, unknown> | undefined): LayoutAlert[] {
  const raw = credentials?.deviceUnlockAlerts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is LayoutAlert =>
      !!a &&
      typeof a === 'object' &&
      typeof (a as { notification_id?: unknown }).notification_id === 'string'
  );
}

async function markLayoutDeviceUnlockAlertRead(
  pnIdentifier: string,
  notificationId: string
): Promise<boolean> {
  const { storageCredentialsService } = await import('./storageCredentialsService');
  const record = await storageCredentialsService.getCredentials(pnIdentifier);
  if (!record?.credentials) return false;
  const alerts = layoutDeviceUnlockAlerts(record.credentials as Record<string, unknown>);
  let changed = false;
  const next = alerts.map((a) => {
    if (a.notification_id === notificationId && !a.read) {
      changed = true;
      return { ...a, read: true };
    }
    return a;
  });
  if (!changed) return false;
  await storageCredentialsService.upsertCredentials(
    pnIdentifier,
    { ...(record.credentials as object), deviceUnlockAlerts: next },
    record.cid ?? undefined
  );
  return true;
}

function requirePn(req: express.Request, res: express.Response): string | null {
  const pn =
    (req.headers['x-user-pn-identifier'] as string) ||
    (req.query.userPnIdentifier as string) ||
    (req.body?.userPnIdentifier as string);
  if (!pn) {
    res.status(401).json({ error: 'unauthorized', error_description: 'User pn identifier required' });
    return null;
  }
  return pn;
}

async function cloudOnDevice(req: express.Request, res: express.Response): Promise<void> {
  if (!requirePn(req, res)) return;
  const { respondCloudOnDevice } = await import('./deviceCloudResult');
  respondCloudOnDevice(res);
}

export function setupNotificationRoutes(app: express.Application) {
  app.get('/api/notifications', cloudOnDevice);
  app.get('/api/notifications/unread-count', cloudOnDevice);
  app.put('/api/notifications/read-all', cloudOnDevice);
  app.delete('/api/notifications/:notificationId', cloudOnDevice);
  app.get('/api/notifications/preferences', cloudOnDevice);
  app.put('/api/notifications/preferences', cloudOnDevice);

  app.put('/api/notifications/:notificationId/read', async (req, res) => {
    try {
      const pn = requirePn(req, res);
      if (!pn) return;
      if (await markLayoutDeviceUnlockAlertRead(pn, req.params.notificationId)) {
        return res.json({ success: true });
      }
      const { respondCloudOnDevice } = await import('./deviceCloudResult');
      respondCloudOnDevice(res);
    } catch (error: any) {
      console.error('Failed to mark notification as read:', error);
      return res.status(500).json({
        error: 'server_error',
        error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark notification as read'
      });
    }
  });
}
