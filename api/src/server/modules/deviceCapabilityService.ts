/**
 * Device capability gate + proof verification for owner API routes.
 */

import type { Request, Response } from 'express';
import {
  DEVICE_CAPABILITIES,
  defaultDevicePolicy,
  evaluateDeviceCapability,
  hashRequestBody,
  isDeviceProofTimestampValid,
  verifyDeviceProof,
  type DevicePolicy,
  type DeviceProofPayload,
  type DeviceRow,
} from '@par-noir/device-auth';
import { PNOAuthService } from './pnOAuthService';
import {
  loadDeviceBundle,
  listDevices,
  readPolicy,
  updateLastSeen
} from './storage/deviceStorageService';

export { DEVICE_CAPABILITIES };

export interface DeviceAuthContext {
  pnIdentifier: string;
  policy: DevicePolicy;
  isKeyed: boolean;
  deviceRow?: DeviceRow;
}

export function normalizePnIdentifier(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export function getBearerPnIdentifier(req: Request): string | null {
  return bearerPn(req)?.pnIdentifier ?? null;
}

function bearerPn(req: Request): { pnIdentifier: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.substring(7).trim();
  const payload = PNOAuthService.validateAccessToken(token);
  if (!payload?.pnIdentifier) return null;
  const pn = payload.pnIdentifier.startsWith('pn-') ? payload.pnIdentifier : `pn-${payload.pnIdentifier}`;
  return { pnIdentifier: pn };
}

async function loadDeviceContext(pn: string): Promise<{
  bundle: Awaited<ReturnType<typeof loadDeviceBundle>>;
  policy: DevicePolicy;
  devices: DeviceRow[];
} | null> {
  const bundle = await loadDeviceBundle(pn);
  if (!bundle) return null;
  try {
    const [policy, devices] = await Promise.all([
      readPolicy(bundle),
      listDevices(bundle, true)
    ]);
    return { bundle, policy, devices };
  } catch (error) {
    console.warn('[deviceCapability] device sheet read failed; using unkeyed fallback:', (error as Error)?.message);
    let policy = defaultDevicePolicy();
    try {
      policy = await readPolicy(bundle);
    } catch {
      /* keep default */
    }
    return { bundle, policy, devices: [] };
  }
}

export async function verifyDeviceProofFromRequest(
  req: Request,
  pnIdentifier: string,
  devices: DeviceRow[]
): Promise<{ ok: boolean; deviceRow?: DeviceRow }> {
  const deviceId = String(req.headers['x-pn-device-id'] || '');
  const signature = String(req.headers['x-pn-device-signature'] || '');
  const timestamp = Number(req.headers['x-pn-device-timestamp']);
  const nonce = String(req.headers['x-pn-device-nonce'] || '');

  if (!deviceId || !signature || !nonce || !Number.isFinite(timestamp)) {
    return { ok: false };
  }
  if (!isDeviceProofTimestampValid(timestamp)) {
    return { ok: false };
  }

  const row = devices.find((d) => d.deviceId === deviceId && d.status === 'active');
  if (!row?.devicePublicKey) return { ok: false };

  const bodyHash = await hashRequestBody(req.body);
  const payload: DeviceProofPayload = {
    pnIdentifier,
    deviceId,
    method: req.method,
    path: req.path,
    bodyHash,
    timestamp,
    nonce,
  };

  const valid = await verifyDeviceProof(row.devicePublicKey, payload, signature);
  if (!valid) return { ok: false };
  return { ok: true, deviceRow: row };
}

export async function resolveDeviceAuthContext(req: Request): Promise<DeviceAuthContext | null> {
  const auth = bearerPn(req);
  if (!auth) return null;

  const bundle = await loadDeviceContext(auth.pnIdentifier);
  if (!bundle) {
    // Drive layout not provisioned yet (first storage credential save). unkeyed_legacy allows bootstrap.
    return {
      pnIdentifier: auth.pnIdentifier,
      policy: defaultDevicePolicy(),
      isKeyed: false,
    };
  }

  const proof = await verifyDeviceProofFromRequest(req, auth.pnIdentifier, bundle.devices);
  return {
    pnIdentifier: auth.pnIdentifier,
    policy: bundle.policy,
    isKeyed: proof.ok,
    deviceRow: proof.deviceRow,
  };
}

export async function assertDeviceCapability(
  req: Request,
  capability: string
): Promise<{ ok: true; ctx: DeviceAuthContext } | { ok: false; status: number; error: string; reason?: string }> {
  const ctx = await resolveDeviceAuthContext(req);
  if (!ctx) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  const decision = evaluateDeviceCapability({
    policy: ctx.policy,
    isKeyed: ctx.isKeyed,
    capability,
  });

  if (!decision.allowed) {
    return {
      ok: false,
      status: 403,
      error: decision.reason === 'device_required' ? 'device_key_required' : 'capability_not_allowed',
      reason: decision.reason,
    };
  }

  if (ctx.isKeyed && ctx.deviceRow) {
    const loaded = await loadDeviceContext(ctx.pnIdentifier);
    if (loaded?.bundle) {
      await updateLastSeen(loaded.bundle, ctx.deviceRow.deviceId);
    }
  }

  return { ok: true, ctx };
}

export async function requireKeyedDevice(
  req: Request
): Promise<{ ok: true; ctx: DeviceAuthContext } | { ok: false; status: number; error: string }> {
  return assertDeviceCapability(req, DEVICE_CAPABILITIES.deviceManage);
}

/**
 * Require bearer auth + device capability for owner routes.
 * When targetPn is set, bearer pnIdentifier must match.
 */
export async function gateOwnerRoute(
  req: Request,
  res: Response,
  capability: string,
  targetPn?: string
): Promise<DeviceAuthContext | null> {
  const auth = bearerPn(req);
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  if (targetPn !== undefined) {
    const normalized = normalizePnIdentifier(targetPn);
    if (auth.pnIdentifier !== normalized) {
      res.status(403).json({ error: 'forbidden' });
      return null;
    }
  }
  const gate = await assertDeviceCapability(req, capability);
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error, reason: gate.reason });
    return null;
  }
  return gate.ctx;
}

/**
 * Gate owner self-access; skip when unauthenticated or reading another user's resource.
 */
export async function gateOwnerSelfRoute(
  req: Request,
  res: Response,
  capability: string,
  targetPn: string
): Promise<boolean> {
  const auth = bearerPn(req);
  if (!auth) return true;
  const normalized = normalizePnIdentifier(targetPn);
  if (auth.pnIdentifier !== normalized) return true;
  const gate = await assertDeviceCapability(req, capability);
  if (!gate.ok) {
    res.status(gate.status).json({ error: gate.error, reason: gate.reason });
    return false;
  }
  return true;
}

export async function getDeviceRegistrySummary(pn: string) {
  const bundle = await loadDeviceContext(pn);
  if (!bundle) return null;
  const active = bundle.devices.filter((d) => d.status === 'active');
  return {
    devices: active.map(({ devicePublicKey: _pk, ...rest }) => rest),
    policy: {
      unkeyedAllows: bundle.policy.unkeyedAllows,
      firstDeviceKeyedAt: bundle.policy.firstDeviceKeyedAt,
    },
    hasKeyedDevices: active.length > 0,
  };
}
