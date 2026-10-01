/**
 * Notification Routes
 * User notifications (list, unread count, read/read-all, delete, preferences)
 * backed by the owner's Drive metadata folder.
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface NotificationRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  getMetadataFolder: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    accountId?: string
  ) => Promise<{ metadataFolderId: string; pnFolderId: string } | null>;
  driveNotInitialized: (res: express.Response) => express.Response;
}

function layoutDeviceUnlockAlerts(credentials: Record<string, unknown> | undefined): Array<{
  notification_id: string;
  user_pn_identifier?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}> {
  const raw = credentials?.deviceUnlockAlerts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is {
      notification_id: string;
      user_pn_identifier?: string;
      type: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
      read: boolean;
      created_at: string;
    } =>
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

export function setupNotificationRoutes(app: express.Application, deps: NotificationRouteDeps) {
  const { extractAccountId, getMetadataFolder, driveNotInitialized } = deps;

  async function resolveOwnerToken(
    req: express.Request,
    res: express.Response,
    pnIdentifier: string,
    account: Record<string, unknown> | null | undefined,
    accountId: string | undefined
  ): Promise<{
    token: {
      access_token: string;
      refresh_token?: string;
      expires_at?: number;
      expires_in?: number;
    };
    userAccessToken: string;
  } | null> {
    if (!account) {
      return {
        token: { access_token: '' },
        userAccessToken: ''
      };
    }
    const { respondCloudOnDevice } = await import('./deviceCloudResult');
    respondCloudOnDevice(res);
    return null;
  }

    app.get('/api/notifications', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const layoutAlerts = layoutDeviceUnlockAlerts(
          userCredentials.credentials as Record<string, unknown>
        );

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        let portable = false;
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          portable = !!( _checkPn && (await isPortableStorageProvider(_checkPn)));
          if (!portable && layoutAlerts.length === 0) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud or custody layout alerts — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to get notifications:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get notifications'
        });
      }
    });

    // GET /api/notifications/unread-count - Get unread count
    app.get('/api/notifications/unread-count', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.json({ count: 0 });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          return res.json({ count: 0 });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to get unread count:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get unread count'
        });
      }
    });

    // PUT /api/notifications/:notificationId/read - Mark notification as read
    app.put('/api/notifications/:notificationId/read', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          const portable = !!( _checkPn && (await isPortableStorageProvider(_checkPn)));
          if (!portable) {
            const layoutOk = await markLayoutDeviceUnlockAlertRead(pnIdentifier, notificationId);
            if (layoutOk) return res.json({ success: true });
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to mark notification as read:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark notification as read'
        });
      }
    });

    // PUT /api/notifications/read-all - Mark all notifications as read
    app.put('/api/notifications/read-all', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to mark all notifications as read:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to mark all notifications as read'
        });
      }
    });

    // DELETE /api/notifications/:notificationId - Delete notification
    app.delete('/api/notifications/:notificationId', async (req, res) => {
      try {
        const { notificationId } = req.params;
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to delete notification:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to delete notification'
        });
      }
    });

    // GET /api/notifications/preferences - Get notification preferences
    app.get('/api/notifications/preferences', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.query.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          // Return default preferences if no credentials
          return res.json({
            user_pn_identifier: userPnIdentifier,
            feed_new_post: true,
            feed_new_comment: true,
            feed_new_like: false,
            feed_new_subscriber: true,
            comment_reply: true,
            mention: true,
            connection_request: true,
            connection_accepted: true,
            repost: true
          });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          // Return default preferences if no Google Drive
          return res.json({
            user_pn_identifier: userPnIdentifier,
            feed_new_post: true,
            feed_new_comment: true,
            feed_new_like: false,
            feed_new_subscriber: true,
            comment_reply: true,
            mention: true,
            connection_request: true,
            connection_accepted: true,
            repost: true
          });
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to get notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to get notification preferences'
        });
      }
    });

    // PUT /api/notifications/preferences - Update notification preferences
    app.put('/api/notifications/preferences', async (req, res) => {
      try {
        const userPnIdentifier = req.headers['x-user-pn-identifier'] as string || req.body.userPnIdentifier as string;
        
        if (!userPnIdentifier) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'User pn identifier required'
          });
        }

        const { NotificationService } = await import('./notificationService');
        const { storageCredentialsService } = await import('./storageCredentialsService');

        // Use pn identifier directly
        const pnIdentifier = userPnIdentifier;

        // Get user's credentials
        const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
        if (!userCredentials?.credentials) {
          return res.status(404).json({ error: 'User credentials not found' });
        }

        const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
          (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
        
        if (googleDriveAccounts.length === 0) {
          const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
          const _checkPn = (typeof pnIdentifier !== 'undefined' && pnIdentifier) || (req.body && req.body.userPnIdentifier) || (req.params && (req.params as any).pnIdentifier) || '';
          if (!_checkPn || !(await isPortableStorageProvider(_checkPn))) {
            return res.status(404).json({ error: 'Storage not connected' });
          }
          // portable social cloud — continue without Drive accounts
        }

        const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
        const accountId = account ? extractAccountId(account) : undefined;
        const { respondCloudOnDevice } = await import('./deviceCloudResult');
        respondCloudOnDevice(res);
        return;
      } catch (error: any) {
        console.error('Failed to update notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update notification preferences'
        });
      }
    });
}
