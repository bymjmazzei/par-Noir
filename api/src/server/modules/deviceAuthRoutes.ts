/**
 * Device registry routes: key devices, pairing, policy, revoke.
 */

import type { Application, Request, Response } from 'express';
import { defaultDevicePolicy, normalizeDevicePolicy, type DeviceRow } from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import {
  getDeviceById,
  listDevices,
  loadDeviceBundle,
  readPolicy,
  resetDeviceRegistry,
  updateDevicePrivateDisplay,
  upsertDevice,
  writePolicy
} from './storage/deviceStorageService';
import {
  assertDeviceCapability,
  DEVICE_CAPABILITIES,
  getDeviceRegistrySummary,
  requireKeyedDevice,
} from './deviceCapabilityService';
import { consumePairingNonce, storePairingNonce } from './devicePairingNonceStore';
import { extractCloudAccessToken } from './cloudAccessToken';
import { isProduction, securityFlags } from '../utils/securityFlags';

const NONCE_TTL_MS = 5 * 60 * 1000;
const PN_CLIENT_PLATFORM_HEADER = 'x-pn-client-platform';

function clientPlatform(req: Request): string {
  return String(req.headers[PN_CLIENT_PLATFORM_HEADER] || '').toLowerCase().trim();
}

function isNativeClientPlatform(platform: string): boolean {
  return platform === 'native-mobile' || platform === 'native-desktop';
}

function bearerPn(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  return payload.pnIdentifier.startsWith('pn-') ? payload.pnIdentifier : `pn-${payload.pnIdentifier}`;
}

async function storageBundle(pn: string, req?: Request) {
  return loadDeviceBundle(pn, { accessToken: extractCloudAccessToken(req) });
}

export function registerDeviceAuthRoutes(app: Application): void {
  app.get('/api/devices/:userPnIdentifier/registry', async (req: Request, res: Response) => {
    try {
      if (!bearerPn(req)) return res.status(401).json({ error: 'unauthorized' });
      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      const summary = await getDeviceRegistrySummary(pn);
      if (!summary) {
        const { defaultDevicePolicy } = await import('@par-noir/device-auth');
        const policy = defaultDevicePolicy();
        return res.json({
          devices: [],
          policy: {
            unkeyedAllows: policy.unkeyedAllows,
            firstDeviceKeyedAt: policy.firstDeviceKeyedAt,
          },
          hasKeyedDevices: false,
        });
      }
      return res.json(summary);
    } catch (e) {
      console.error('[devices] registry:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.get('/api/devices/:userPnIdentifier/policy', async (req: Request, res: Response) => {
    try {
      if (!bearerPn(req)) return res.status(401).json({ error: 'unauthorized' });
      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      const bundle = await storageBundle(pn, req);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });
      const policy = await readPolicy(bundle);
      return res.json({ policy });
    } catch (e) {
      console.error('[devices] policy get:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.patch('/api/devices/:userPnIdentifier/policy', async (req: Request, res: Response) => {
    try {
      const gate = await requireKeyedDevice(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      if (pn !== gate.ctx.pnIdentifier) {
        return res.status(403).json({ error: 'pn_mismatch' });
      }

      const { unkeyedAllows } = req.body ?? {};
      if (!Array.isArray(unkeyedAllows)) {
        return res.status(400).json({ error: 'unkeyedAllows array required' });
      }

      const bundle = await storageBundle(pn, req);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

      const existing = await readPolicy(bundle);

      // Strip immutable / non-configurable caps so crafted bodies cannot store mailbox or drive.upload.
      const policy = normalizeDevicePolicy({
        ...existing,
        unkeyedAllows: unkeyedAllows.filter((x: unknown) => typeof x === 'string'),
      });

      await writePolicy(bundle, policy);

      return res.json({ success: true, policy });
    } catch (e) {
      console.error('[devices] policy patch:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/devices/pairing/nonce', async (req: Request, res: Response) => {
    try {
      const gate = await requireKeyedDevice(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const { userPnIdentifier } = req.body ?? {};
      const pn = String(userPnIdentifier || gate.ctx.pnIdentifier);
      if (pn !== gate.ctx.pnIdentifier) {
        return res.status(403).json({ error: 'pn_mismatch' });
      }

      const nonce = crypto.randomUUID();
      await storePairingNonce(nonce, {
        pnIdentifier: pn,
        expiresAt: Date.now() + NONCE_TTL_MS,
        createdByDeviceId: gate.ctx.deviceRow!.deviceId,
      });

      return res.json({
        pairingNonce: nonce,
        expiresAt: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
        pnIdentifier: pn,
      });
    } catch (e) {
      console.error('[devices] pairing nonce:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/devices/register', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      const platform = clientPlatform(req);
      if (!isNativeClientPlatform(platform)) {
        return res.status(403).json({
          error: 'native_client_required',
          error_description:
            'Device keying is only available in the mobile or desktop app. Use Download the app from the web dashboard.',
        });
      }

      const {
        userPnIdentifier,
        deviceId,
        devicePublicKey,
        privateDisplay,
        pairingNonce,
        isPrimary,
      } = req.body ?? {};

      const pn = String(userPnIdentifier || authPn);
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });

      if (!deviceId || !devicePublicKey) {
        return res.status(400).json({ error: 'deviceId and devicePublicKey required' });
      }

      if (typeof privateDisplay !== 'string' || !privateDisplay.trim()) {
        return res.status(400).json({ error: 'privateDisplay required' });
      }

      const cloudToken = extractCloudAccessToken(req);
      const bundle = await storageBundle(pn, req);
      if (!bundle) {
        return res.status(404).json({
          error: 'Storage not connected',
          error_description: cloudToken
            ? 'Drive layout is incomplete on the server. Open Storage once after reconnecting Google Drive, then try again.'
            : 'Reconnect Google Drive on this device first, then key the device.',
        });
      }

      const active = await listDevices(bundle, false);

      if (active.length > 0) {
        if (!pairingNonce || typeof pairingNonce !== 'string') {
          return res.status(403).json({ error: 'pairing_nonce_required' });
        }
        const entry = await consumePairingNonce(pairingNonce);
        if (!entry || entry.pnIdentifier !== pn) {
          return res.status(403).json({ error: 'invalid_pairing_nonce' });
        }
      }

      const now = new Date().toISOString();
      const row: DeviceRow = {
        deviceId,
        devicePublicKey,
        label: '',
        deviceType: platform === 'native-desktop' ? 'desktop' : 'mobile',
        keyType: 'software',
        status: 'active',
        isPrimary: isPrimary === true || active.length === 0,
        createdAt: now,
        lastSeenAt: '',
        privateDisplay: privateDisplay.trim(),
      };

      await upsertDevice(bundle, row);

      let policy = await readPolicy(bundle);

      if (!policy.firstDeviceKeyedAt) {
        policy = {
          ...defaultDevicePolicy(),
          ...policy,
          firstDeviceKeyedAt: now,
        };
        await writePolicy(bundle, policy);
      }

      return res.json({ success: true, deviceId, firstDevice: active.length === 0 });
    } catch (e) {
      console.error('[devices] register:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Dev / emergency: wipe device registry without custodian quorum.
   * Requires ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM=1 and cloud access token.
   * Production user path is Shamir device_registry_reset finalize.
   */
  app.post('/api/devices/:userPnIdentifier/registry/reset', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      if (!securityFlags.allowDeviceRegistryResetWithoutQuorum) {
        return res.status(403).json({
          error: 'registry_reset_requires_quorum',
          error_description:
            'Use Recovery → Reset keyed devices (custodian quorum), or set ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM for development.',
        });
      }

      if (isProduction()) {
        console.warn(
          '[devices] registry reset without quorum used in production — disable ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM after unblocking'
        );
      }

      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });

      const bundle = await storageBundle(pn, req);
      if (!bundle) {
        return res.status(404).json({
          error: 'Storage not connected',
          error_description: 'Reconnect Google Drive, then reset keyed devices.',
        });
      }

      const result = await resetDeviceRegistry(bundle);
      return res.json({ success: true, ...result });
    } catch (e) {
      console.error('[devices] registry reset:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Finalize Shamir device_registry_reset after custodian quorum (request status ready).
   */
  app.post('/api/devices/registry/reset/finalize', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, requestId } = req.body ?? {};
      const pn = String(userPnIdentifier || authPn);
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });
      if (!requestId || typeof requestId !== 'string') {
        return res.status(400).json({ error: 'requestId required' });
      }

      const { getRecoveryDriveContext } = await import('./recoveryDriveContext');
      const cloudTok = extractCloudAccessToken(req);
      const ctx = await getRecoveryDriveContext(pn, cloudTok ? { accessToken: cloudTok } : undefined);
      if (!ctx) return res.status(404).json({ error: 'Drive not connected' });

      const { RecoverySheetsService } = await import('./recoverySheetsService');
      const spreadsheetId = await RecoverySheetsService.getOrCreateSpreadsheet(
        ctx.token,
        ctx.metadataFolderId,
        ctx.pnIdentifier,
        ctx.accountId
      );
      const requests = await RecoverySheetsService.listRecoveryRequests(
        ctx.token,
        spreadsheetId,
        ctx.pnIdentifier,
        ctx.accountId
      );
      const row = requests.find((r) => r.requestId === requestId);
      if (!row) return res.status(404).json({ error: 'request_not_found' });
      if (row.requestType !== 'device_registry_reset') {
        return res.status(400).json({ error: 'wrong_request_type' });
      }
      if (row.status !== 'ready') {
        return res.status(403).json({
          error: 'quorum_not_met',
          error_description: 'Custodian quorum not reached for this device registry reset.',
        });
      }

      const bundle = await storageBundle(pn, req);
      if (!bundle) {
        return res.status(404).json({
          error: 'Storage not connected',
          error_description: 'Reconnect Google Drive with X-PN-Cloud-Access-Token, then finalize.',
        });
      }

      const result = await resetDeviceRegistry(bundle);
      await RecoverySheetsService.upsertRecoveryRequest(
        ctx.token,
        spreadsheetId,
        { ...row, status: 'completed' },
        ctx.pnIdentifier,
        ctx.accountId
      );
      return res.json({ success: true, ...result });
    } catch (e) {
      console.error('[devices] registry reset finalize:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/devices/:deviceId/revoke', async (req: Request, res: Response) => {
    try {
      const gate = await requireKeyedDevice(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const { userPnIdentifier } = req.body ?? {};
      const pn = String(userPnIdentifier || gate.ctx.pnIdentifier);
      const bundle = await storageBundle(pn, req);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

      const row = await getDeviceById(bundle, req.params.deviceId);
      if (!row) return res.status(404).json({ error: 'device_not_found' });

      await upsertDevice(bundle, { ...row, status: 'revoked' });

      return res.json({ success: true, deviceId: req.params.deviceId });
    } catch (e) {
      console.error('[devices] revoke:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/devices/:deviceId/heartbeat', async (req: Request, res: Response) => {
    try {
      const gate = await assertDeviceCapability(req, DEVICE_CAPABILITIES.deviceManage);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error, reason: gate.reason });

      if (gate.ctx.deviceRow?.deviceId !== req.params.deviceId) {
        return res.status(403).json({ error: 'device_mismatch' });
      }

      const { privateDisplay } = req.body ?? {};
      if (typeof privateDisplay !== 'string' || !privateDisplay.trim()) {
        return res.status(400).json({ error: 'privateDisplay required' });
      }

      const bundle = await storageBundle(gate.ctx.pnIdentifier, req);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

      await updateDevicePrivateDisplay(bundle, req.params.deviceId, privateDisplay.trim());

      return res.json({ success: true });
    } catch (e) {
      console.error('[devices] heartbeat:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Unkeyed unlock on a pN that already has keyed devices → notify owner's Drive notifications
   * so a keyed device can open pairing QR.
   */
  app.post('/api/devices/unkeyed-unlock-alert', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });

      const { userPnIdentifier, deviceHint, fingerprint } = req.body ?? {};
      const pn = String(userPnIdentifier || authPn);
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });

      // Reject if this request already proves a keyed device
      const keyedGate = await requireKeyedDevice(req);
      if (keyedGate.ok) {
        return res.json({ success: true, skipped: true, reason: 'already_keyed' });
      }

      const summary = await getDeviceRegistrySummary(pn);
      if (!summary?.hasKeyedDevices) {
        return res.json({ success: true, skipped: true, reason: 'no_keyed_devices' });
      }

      const coarseHint =
        typeof deviceHint === 'string' ? deviceHint.replace(/[^\w\s.-]/g, '').slice(0, 64) : 'unknown';
      const fp =
        typeof fingerprint === 'string'
          ? fingerprint.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
          : 'default';

      const { NotificationService } = await import('./notificationService');
      const { getRecoveryDriveContext } = await import('./recoveryDriveContext');
      const { isPortableStorageProvider } = await import('./storage/storageProviderUtils');
      const { storageCredentialsService } = await import('./storageCredentialsService');

      // Dedupe: unread device_unkeyed_unlock with same fingerprint within 1h
      const DEDUPE_MS = 60 * 60 * 1000;
      let existing: Array<{
        type?: string;
        read?: boolean;
        created_at?: string;
        data?: Record<string, unknown>;
      }> = [];
      try {
        const drive = await getRecoveryDriveContext(pn);
        const token = drive?.token?.access_token || '';
        const metaId = drive?.metadataFolderId || '';
        const result = await NotificationService.getUserNotifications(token, metaId, pn, drive?.accountId, {
          limit: 20,
          unreadOnly: true,
          type: 'device_unkeyed_unlock' as never,
        });
        existing = result.notifications || [];
      } catch {
        /* also check credentials layout */
      }
      try {
        const record = await storageCredentialsService.getCredentials(pn);
        const layoutAlerts = Array.isArray(
          (record?.credentials as { deviceUnlockAlerts?: unknown })?.deviceUnlockAlerts
        )
          ? ((record!.credentials as { deviceUnlockAlerts: typeof existing }).deviceUnlockAlerts)
          : [];
        existing = existing.concat(layoutAlerts.filter((a) => !a.read));
      } catch {
        /* ignore */
      }

      const now = Date.now();
      const dup = existing.some((n) => {
        if (n.type !== 'device_unkeyed_unlock' || n.read) return false;
        const created = n.created_at ? Date.parse(n.created_at) : 0;
        if (now - created > DEDUPE_MS) return false;
        return String(n.data?.fingerprint || '') === fp;
      });
      if (dup) {
        return res.json({ success: true, skipped: true, reason: 'deduped' });
      }

      const notificationBody = {
        user_pn_identifier: pn,
        type: 'device_unkeyed_unlock' as const,
        title: 'New device unlock',
        message: `An unrecognized browser unlocked this pN (${coarseHint || 'unknown'}). Pair it from Recovery if this was you.`,
        data: {
          action: 'show_device_pairing_qr',
          fingerprint: fp,
          device_hint: coarseHint,
        },
      };

      if (await isPortableStorageProvider(pn)) {
        await NotificationService.createNotification('', '', pn, notificationBody);
        return res.json({ success: true });
      }

      const drive = await getRecoveryDriveContext(pn);
      if (!drive?.token?.access_token || !drive.metadataFolderId) {
        const record = await storageCredentialsService.getCredentials(pn);
        const creds = { ...(record?.credentials || {}) } as Record<string, unknown>;
        const alerts = Array.isArray(creds.deviceUnlockAlerts)
          ? [...(creds.deviceUnlockAlerts as Record<string, unknown>[])]
          : [];
        alerts.unshift({
          notification_id: crypto.randomUUID(),
          type: 'device_unkeyed_unlock',
          title: notificationBody.title,
          message: notificationBody.message,
          data: notificationBody.data,
          read: false,
          created_at: new Date().toISOString(),
        });
        creds.deviceUnlockAlerts = alerts.slice(0, 20);
        await storageCredentialsService.upsertCredentials(pn, creds, record?.cid ?? undefined);
        try {
          const { emitNewNotification } = await import('./realtimeEvents');
          emitNewNotification(pn, 'device_unkeyed_unlock');
        } catch {
          /* optional */
        }
        return res.json({ success: true, stored: 'credentials_layout' });
      }

      await NotificationService.createNotification(
        drive.token.access_token,
        drive.metadataFolderId,
        pn,
        notificationBody
      );
      return res.json({ success: true });
    } catch (e) {
      console.error('[devices] unkeyed-unlock-alert:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
