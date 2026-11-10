/**
 * Device registry routes: key devices, pairing, policy, revoke.
 */

import type { Application, Request, Response } from 'express';
import { defaultDevicePolicy, normalizeDevicePolicy, type DeviceRow } from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import {
  getDeviceById,
  importDeviceRegistry,
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
import {
  evaluateRequestQuorum,
  getRecoveryRelayStore,
  recoveryOwnerHash,
  refreshRequestExpiry,
} from './recoveryRelayService';
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
      const bundle = await loadDeviceBundle(pn);
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

      const bundle = await loadDeviceBundle(pn);

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

      const bundle = await loadDeviceBundle(pn);

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
   * Requires ALLOW_DEVICE_REGISTRY_RESET_WITHOUT_QUORUM=1.
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

      const bundle = await loadDeviceBundle(pn);

      const result = await resetDeviceRegistry(bundle);
      return res.json({ success: true, ...result });
    } catch (e) {
      console.error('[devices] registry reset:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Finalize a device registry reset: a device_registry_reset after custodian quorum, or a
   * released key_recovery (the owner recovered with their key and lost their keyed devices).
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

      const store = getRecoveryRelayStore();
      const found = await store.getRequest(requestId);
      if (!found || found.ownerHash !== recoveryOwnerHash(pn)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      const row = await refreshRequestExpiry(store, found);
      if (found.requestType === 'key_recovery') {
        if (row.status !== 'released') {
          return res.status(403).json({
            error: 'recovery_not_released',
            error_description: 'Finish key recovery before resetting keyed devices.',
          });
        }
      } else if (found.requestType === 'device_registry_reset') {
        const quorum = evaluateRequestQuorum(row, await store.listCustodians(row.ownerHash));
        if (row.status !== 'ready' || !quorum.ready) {
          return res.status(403).json({
            error: 'quorum_not_met',
            error_description: 'Custodian quorum not reached for this device registry reset.',
          });
        }
      } else {
        return res.status(400).json({ error: 'wrong_request_type' });
      }

      const bundle = await loadDeviceBundle(pn);

      const result = await resetDeviceRegistry(bundle);
      await store.updateRequest(row.requestId, { status: 'completed' });
      return res.json({ success: true, ...result });
    } catch (e) {
      console.error('[devices] registry reset finalize:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * One-time import of the registry a device kept in its own cloud before the API owned it.
   * Refused once the API has any rows for this pN.
   */
  app.post('/api/devices/:userPnIdentifier/registry/import', async (req: Request, res: Response) => {
    try {
      const authPn = bearerPn(req);
      if (!authPn) return res.status(401).json({ error: 'unauthorized' });
      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });

      const { devices, policy } = req.body ?? {};
      if (!Array.isArray(devices)) {
        return res.status(400).json({ error: 'devices array required' });
      }
      const rows: DeviceRow[] = [];
      for (const d of devices) {
        if (!d || typeof d.deviceId !== 'string' || typeof d.devicePublicKey !== 'string') {
          return res.status(400).json({ error: 'each device needs deviceId and devicePublicKey' });
        }
        rows.push({
          deviceId: d.deviceId,
          devicePublicKey: d.devicePublicKey,
          label: typeof d.label === 'string' ? d.label : '',
          deviceType: ['mobile', 'desktop', 'tablet'].includes(d.deviceType) ? d.deviceType : 'other',
          keyType: d.keyType === 'webauthn' ? 'webauthn' : 'software',
          status: d.status === 'revoked' ? 'revoked' : 'active',
          isPrimary: d.isPrimary === true,
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString(),
          lastSeenAt: typeof d.lastSeenAt === 'string' ? d.lastSeenAt : '',
          ...(typeof d.privateDisplay === 'string' && d.privateDisplay
            ? { privateDisplay: d.privateDisplay }
            : {}),
        });
      }

      const result = await importDeviceRegistry(
        await loadDeviceBundle(pn),
        rows,
        policy && typeof policy === 'object' ? policy : null
      );
      if ('refused' in result) {
        return res.status(409).json({ error: result.refused });
      }
      return res.json({ success: true, imported: result.imported });
    } catch (e) {
      console.error('[devices] registry import:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  app.post('/api/devices/:deviceId/revoke', async (req: Request, res: Response) => {
    try {
      const gate = await requireKeyedDevice(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const { userPnIdentifier } = req.body ?? {};
      const pn = String(userPnIdentifier || gate.ctx.pnIdentifier);
      const bundle = await loadDeviceBundle(pn);

      const row = await getDeviceById(bundle, req.params.deviceId);
      if (!row) return res.status(404).json({ error: 'device_not_found' });

      await upsertDevice(bundle, { ...row, status: 'revoked' });
      const { PushService } = await import('./pushService');
      await PushService.removeDevice(pn, req.params.deviceId).catch(() => undefined);

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

      const bundle = await loadDeviceBundle(gate.ctx.pnIdentifier);

      await updateDevicePrivateDisplay(bundle, req.params.deviceId, privateDisplay.trim());

      return res.json({ success: true });
    } catch (e) {
      console.error('[devices] heartbeat:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  /**
   * Unkeyed unlock on a pN that already has keyed devices → alert stored in the layout shell
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

      const { storageCredentialsService } = await import('./storageCredentialsService');
      const record = await storageCredentialsService.getCredentials(pn);
      const creds = { ...(record?.credentials || {}) } as Record<string, unknown>;
      const alerts = Array.isArray(creds.deviceUnlockAlerts)
        ? [...(creds.deviceUnlockAlerts as Array<Record<string, unknown>>)]
        : [];

      // Dedupe: unread device_unkeyed_unlock with same fingerprint within 1h
      const DEDUPE_MS = 60 * 60 * 1000;
      const now = Date.now();
      const dup = alerts.some((n) => {
        if (n.type !== 'device_unkeyed_unlock' || n.read) return false;
        const created = typeof n.created_at === 'string' ? Date.parse(n.created_at) : 0;
        if (now - created > DEDUPE_MS) return false;
        return String((n.data as { fingerprint?: unknown } | undefined)?.fingerprint || '') === fp;
      });
      if (dup) {
        return res.json({ success: true, skipped: true, reason: 'deduped' });
      }

      alerts.unshift({
        notification_id: crypto.randomUUID(),
        user_pn_identifier: pn,
        type: 'device_unkeyed_unlock',
        title: 'New device unlock',
        message: `An unrecognized browser unlocked this pN (${coarseHint || 'unknown'}). Pair it from Recovery if this was you.`,
        data: {
          action: 'show_device_pairing_qr',
          fingerprint: fp,
          device_hint: coarseHint,
        },
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
    } catch (e) {
      console.error('[devices] unkeyed-unlock-alert:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
