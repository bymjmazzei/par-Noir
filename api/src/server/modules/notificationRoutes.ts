/**
 * Notification Routes
 * User notifications (list, unread count, read/read-all, delete, preferences)
 * backed by the owner's Drive metadata folder, plus mobile push token registration.
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';
import { getBearerTokenPayload } from '../middleware/authMiddleware';

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
    try {
      const { resolveOwnerDriveToken } = await import('./ownerDriveToken');
      const resolved = await resolveOwnerDriveToken(req, pnIdentifier, { accountId, account });
      return { token: resolved.token, userAccessToken: resolved.token.access_token };
    } catch (error) {
      const { respondDriveTokenError } = await import('./ownerDriveToken');
      if (respondDriveTokenError(res, error)) return null;
      throw error;
    }
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            // Device custody: tokens may be absent; still return layout alerts
            if (layoutAlerts.length === 0) return driveNotInitialized(res);
          } else {
            metadataFolderId = _g.metadataFolderId;
          }
        }

        const MAX_NOTIFICATIONS_PAGE_SIZE = 500;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, MAX_NOTIFICATIONS_PAGE_SIZE);
        const offset = parseInt(req.query.offset as string) || 0;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type as string | undefined;

        let sheetNotifications: Awaited<
          ReturnType<typeof NotificationService.getUserNotifications>
        >['notifications'] = [];
        let sheetTotal = 0;
        if (portable || metadataFolderId || !account) {
          try {
            const result = await NotificationService.getUserNotifications(
              userAccessToken,
              metadataFolderId,
              pnIdentifier,
              accountId,
              {
                limit: MAX_NOTIFICATIONS_PAGE_SIZE,
                offset: 0,
                unreadOnly,
                type: type as any
              }
            );
            sheetNotifications = result.notifications;
            sheetTotal = result.total;
          } catch {
            sheetNotifications = [];
            sheetTotal = 0;
          }
        }

        let merged = [
          ...layoutAlerts.map((a) => ({
            ...a,
            user_pn_identifier: a.user_pn_identifier || pnIdentifier,
          })),
          ...sheetNotifications,
        ];
        if (unreadOnly) merged = merged.filter((n) => !n.read);
        if (type) merged = merged.filter((n) => n.type === type);
        merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const total = Math.max(sheetTotal, 0) + layoutAlerts.filter((a) => {
          if (unreadOnly && a.read) return false;
          if (type && a.type !== type) return false;
          return true;
        }).length;
        const page = merged.slice(offset, offset + limit);

        return res.json({
          notifications: page,
          total,
          limit,
          offset
        });
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const count = await NotificationService.getUnreadCount(userAccessToken, metadataFolderId, pnIdentifier, accountId);

        return res.json({ count });
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) {
            const layoutOk = await markLayoutDeviceUnlockAlertRead(pnIdentifier, notificationId);
            if (layoutOk) return res.json({ success: true });
            return driveNotInitialized(res);
          }
          metadataFolderId = _g.metadataFolderId;
        }

        let success = false;
        try {
          success = await NotificationService.markAsRead(
            userAccessToken,
            metadataFolderId,
            pnIdentifier,
            notificationId
          );
        } catch {
          success = false;
        }
        if (!success) {
          success = await markLayoutDeviceUnlockAlertRead(pnIdentifier, notificationId);
        }

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        return res.json({ success: true });
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const count = await NotificationService.markAllAsRead(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json({ success: true, markedRead: count });
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const success = await NotificationService.deleteNotification(userAccessToken, metadataFolderId, pnIdentifier, notificationId);

        if (!success) {
          return res.status(404).json({
            error: 'not_found',
            error_description: 'Notification not found'
          });
        }

        return res.json({ success: true });
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const preferences = await NotificationService.getPreferences(userAccessToken, metadataFolderId, pnIdentifier);

        return res.json(preferences);
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
        const resolved = await resolveOwnerToken(req, res, pnIdentifier, account, accountId);
        if (!resolved) return;
        const { token, userAccessToken } = resolved;
        
        let metadataFolderId = '';
        if (account) {
          const _g = await getMetadataFolder(token, pnIdentifier, accountId);
          if (!_g) return driveNotInitialized(res);
          metadataFolderId = _g.metadataFolderId;
        }

        const { user_did, ...preferencesUpdate } = req.body;
        const preferences = await NotificationService.updatePreferences(
          userAccessToken,
          metadataFolderId,
          userCredentials.identityId,
          preferencesUpdate
        );

        return res.json(preferences);
      } catch (error: any) {
        console.error('Failed to update notification preferences:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update notification preferences'
        });
      }
    });

    // POST /api/push/register - Register device token for push notifications
    app.post('/api/push/register', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or expired token' });
        }
        const { deviceToken, platform } = req.body;
        if (!deviceToken || !platform || !['ios', 'android'].includes(platform)) {
          return res.status(400).json({ error: 'deviceToken and platform (ios|android) required' });
        }
        const { PushService } = await import('./pushService');
        await PushService.registerToken(tokenPayload.pnIdentifier, deviceToken, platform);
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Push register failed:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to register'
        });
      }
    });

    // DELETE /api/push/register - Unregister device token
    app.delete('/api/push/register', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload?.pnIdentifier) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or expired token' });
        }
        const deviceToken = req.body?.deviceToken || req.query.deviceToken;
        if (!deviceToken) {
          return res.status(400).json({ error: 'deviceToken required' });
        }
        const { PushService } = await import('./pushService');
        await PushService.unregisterToken(tokenPayload.pnIdentifier, deviceToken);
        return res.json({ success: true });
      } catch (error: any) {
        console.error('Push unregister failed:', error);
        return res.status(500).json({
          error: 'server_error',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to unregister'
        });
      }
    });
}
