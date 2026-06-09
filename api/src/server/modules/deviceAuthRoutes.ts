/**
 * Device registry routes: key devices, pairing, policy, revoke.
 */

import type { Application, Request, Response } from 'express';
import { defaultDevicePolicy, type DeviceRow } from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import { getRecoveryDriveContext } from './recoveryDriveContext';
import { DeviceSheetsService } from './deviceSheetsService';
import {
  assertDeviceCapability,
  DEVICE_CAPABILITIES,
  getDeviceRegistrySummary,
  requireKeyedDevice,
} from './deviceCapabilityService';

interface PairingNonceEntry {
  pnIdentifier: string;
  expiresAt: number;
  createdByDeviceId: string;
}

const pairingNonces = new Map<string, PairingNonceEntry>();
const NONCE_TTL_MS = 5 * 60 * 1000;

function bearerPn(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  return payload.pnIdentifier.startsWith('pn-') ? payload.pnIdentifier : `pn-${payload.pnIdentifier}`;
}

async function driveBundle(pn: string) {
  const ctx = await getRecoveryDriveContext(pn);
  if (!ctx) return null;
  const spreadsheetId = await DeviceSheetsService.getOrCreateSpreadsheet(
    ctx.token,
    ctx.metadataFolderId,
    ctx.pnIdentifier,
    ctx.accountId
  );
  return { ctx, spreadsheetId };
}

export function registerDeviceAuthRoutes(app: Application): void {
  app.get('/api/devices/:userPnIdentifier/registry', async (req: Request, res: Response) => {
    try {
      if (!bearerPn(req)) return res.status(401).json({ error: 'unauthorized' });
      const pn = req.params.userPnIdentifier.startsWith('pn-')
        ? req.params.userPnIdentifier
        : `pn-${req.params.userPnIdentifier}`;
      const summary = await getDeviceRegistrySummary(pn);
      if (!summary) return res.status(404).json({ error: 'Drive not connected' });
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
      const bundle = await driveBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });
      const policy = await DeviceSheetsService.readPolicy(
        bundle.ctx.token,
        bundle.ctx.metadataFolderId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );
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

      const bundle = await driveBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const existing = await DeviceSheetsService.readPolicy(
        bundle.ctx.token,
        bundle.ctx.metadataFolderId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      const policy = {
        ...existing,
        unkeyedAllows: unkeyedAllows.filter((x: unknown) => typeof x === 'string'),
      };

      await DeviceSheetsService.writePolicy(
        bundle.ctx.token,
        bundle.ctx.metadataFolderId,
        policy,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

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
      pairingNonces.set(nonce, {
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

      const bundle = await driveBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const active = await DeviceSheetsService.listDevices(
        bundle.ctx.token,
        bundle.spreadsheetId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId,
        false
      );

      if (active.length > 0) {
        if (!pairingNonce || typeof pairingNonce !== 'string') {
          return res.status(403).json({ error: 'pairing_nonce_required' });
        }
        const entry = pairingNonces.get(pairingNonce);
        if (!entry || entry.pnIdentifier !== pn || entry.expiresAt < Date.now()) {
          return res.status(403).json({ error: 'invalid_pairing_nonce' });
        }
        pairingNonces.delete(pairingNonce);
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

      await DeviceSheetsService.upsertDevice(
        bundle.ctx.token,
        bundle.spreadsheetId,
        row,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      let policy = await DeviceSheetsService.readPolicy(
        bundle.ctx.token,
        bundle.ctx.metadataFolderId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      if (!policy.firstDeviceKeyedAt) {
        policy = {
          ...defaultDevicePolicy(),
          ...policy,
          firstDeviceKeyedAt: now,
        };
        await DeviceSheetsService.writePolicy(
          bundle.ctx.token,
          bundle.ctx.metadataFolderId,
          policy,
          bundle.ctx.pnIdentifier,
          bundle.ctx.accountId
        );
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
      const bundle = await driveBundle(pn);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      const row = await DeviceSheetsService.getDeviceById(
        bundle.ctx.token,
        bundle.spreadsheetId,
        req.params.deviceId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );
      if (!row) return res.status(404).json({ error: 'device_not_found' });

      await DeviceSheetsService.upsertDevice(
        bundle.ctx.token,
        bundle.spreadsheetId,
        { ...row, status: 'revoked' },
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

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

      const bundle = await driveBundle(gate.ctx.pnIdentifier);
      if (!bundle) return res.status(404).json({ error: 'Drive not connected' });

      await DeviceSheetsService.updateLastSeen(
        bundle.ctx.token,
        bundle.spreadsheetId,
        req.params.deviceId,
        bundle.ctx.pnIdentifier,
        bundle.ctx.accountId
      );

      return res.json({ success: true });
    } catch (e) {
      console.error('[devices] heartbeat:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });
}
