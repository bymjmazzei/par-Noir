/**
 * Device registry routes: key devices, pairing, policy, revoke.
 */

import type { Application, Request, Response } from 'express';
import { defaultDevicePolicy, type DeviceRow } from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import {
  getDeviceById,
  listDevices,
  loadDeviceBundle,
  readPolicy,
  updateLastSeen,
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

const NONCE_TTL_MS = 5 * 60 * 1000;

function bearerPn(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  return payload.pnIdentifier.startsWith('pn-') ? payload.pnIdentifier : `pn-${payload.pnIdentifier}`;
}

async function storageBundle(pn: string) {
  return loadDeviceBundle(pn);
}

export function registerDeviceAuthRoutes(app: Application): void {
  app.get('/api/devices/:userPnIdentifier/registry', async (req: Request, res: Response) => {
    try {
      if (!bearerPn(req)) return res.status(401).json({ error: 'unauthorized' });
      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      const summary = await getDeviceRegistrySummary(pn);
      if (!summary) return res.status(404).json({ error: 'Storage not connected' });
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
      const bundle = await storageBundle(pn);
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

      const bundle = await storageBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

      const existing = await readPolicy(bundle);

      const policy = {
        ...existing,
        unkeyedAllows: unkeyedAllows.filter((x: unknown) => typeof x === 'string'),
      };

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

      const {
        userPnIdentifier,
        deviceId,
        devicePublicKey,
        label,
        deviceType,
        pairingNonce,
        isPrimary,
      } = req.body ?? {};

      const pn = String(userPnIdentifier || authPn);
      if (pn !== authPn) return res.status(403).json({ error: 'pn_mismatch' });

      if (!deviceId || !devicePublicKey) {
        return res.status(400).json({ error: 'deviceId and devicePublicKey required' });
      }

      const bundle = await storageBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

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
        label: label || 'Device',
        deviceType: deviceType || 'other',
        keyType: 'software',
        status: 'active',
        isPrimary: isPrimary === true || active.length === 0,
        createdAt: now,
        lastSeenAt: now,
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

  app.post('/api/devices/:deviceId/revoke', async (req: Request, res: Response) => {
    try {
      const gate = await requireKeyedDevice(req);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });

      const { userPnIdentifier } = req.body ?? {};
      const pn = String(userPnIdentifier || gate.ctx.pnIdentifier);
      const bundle = await storageBundle(pn);
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

      const bundle = await storageBundle(gate.ctx.pnIdentifier);
      if (!bundle) return res.status(404).json({ error: 'Storage not connected' });

      await updateLastSeen(bundle, req.params.deviceId);

      return res.json({ success: true });
    } catch (e) {
      console.error('[devices] heartbeat:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
