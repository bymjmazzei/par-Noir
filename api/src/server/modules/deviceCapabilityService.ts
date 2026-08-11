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
import { hashIdentifier, safeLogger } from '../../utils/logger';
import {
  loadDeviceBundle,
  listDevices,
  readPolicy,
} from './storage/deviceStorageService';
import type { DeviceStorageBundle } from './storage/deviceStorageService';

export { DEVICE_CAPABILITIES };

const DEVICE_CONTEXT_CACHE_TTL_MS = 30_000;

type DeviceContextLoad = {
  bundle: DeviceStorageBundle;
  policy: DevicePolicy;
  devices: DeviceRow[];
};

const deviceContextCache = new Map<string, { expiresAt: number; value: DeviceContextLoad }>();

/** Clear cached device context (tests). */
export function clearDeviceContextCache(pn?: string): void {
  if (pn) {
    deviceContextCache.delete(normalizePnIdentifier(pn));
  } else {
    deviceContextCache.clear();
  }
}

export interface DeviceAuthContext {
  pnIdentifier: string;
  policy: DevicePolicy;
  isKeyed: boolean;
  deviceRow?: DeviceRow;
  /** Populated when Drive device registry is loaded. */
  deviceBundle?: DeviceStorageBundle;
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

async function loadDeviceContextUncached(pn: string): Promise<DeviceContextLoad | null> {
  let bundle: DeviceStorageBundle | null;
  try {
    bundle = await loadDeviceBundle(pn);
  } catch (error) {
    // Belt: custody miss must not 500 device gates (ownerStorageContext soft-paths this).
    const { DriveIndexError } = await import('./pnDriveIndex');
    if (error instanceof DriveIndexError && error.code === 'CLOUD_TOKEN_REQUIRED') {
      return null;
    }
    throw error;
  }
  if (!bundle) return null;
  try {
    const [policy, devices] = await Promise.all([
      readPolicy(bundle),
      listDevices(bundle, true)
    ]);
    return { bundle, policy, devices };
  } catch (error) {
    safeLogger.warn('[deviceCapability] device sheet read failed; using unkeyed fallback', {
      err: (error as Error)?.message
    });
    let policy = defaultDevicePolicy();
    try {
      policy = await readPolicy(bundle);
    } catch {
      /* keep default */
    }
    return { bundle, policy, devices: [] };
  }
}

async function loadDeviceContext(pn: string): Promise<DeviceContextLoad | null> {
  const normalized = normalizePnIdentifier(pn);
  const now = Date.now();
  const cached = deviceContextCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const loaded = await loadDeviceContextUncached(normalized);
  if (loaded) {
    deviceContextCache.set(normalized, {
      expiresAt: now + DEVICE_CONTEXT_CACHE_TTL_MS,
      value: loaded,
    });
  }
  return loaded;
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
    // Drive layout not provisioned yet (first storage credential save).
    // unkeyed_legacy uses LEGACY_BOOTSTRAP_ALLOWS only — not allow-all.
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
    deviceBundle: bundle.bundle,
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
      safeLogger.warn('[gateOwnerRoute] Bearer pN does not match route pN', {
        routePn: hashIdentifier(normalized),
        bearerPn: hashIdentifier(auth.pnIdentifier),
      });
      res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
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
 * Gate storage credential save: bearer must match route pN. Skip device capability when
 * Drive layout is not provisioned yet (bootstrap after disconnect / first connect).
 */
export async function gateStorageCredentialsPut(
  req: Request,
  res: Response,
  targetPn: string
): Promise<DeviceAuthContext | null> {
  const auth = bearerPn(req);
  if (!auth) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  const normalized = normalizePnIdentifier(targetPn);
  if (auth.pnIdentifier !== normalized) {
    safeLogger.warn('[gateStorageCredentialsPut] Bearer pN does not match route pN', {
      routePn: hashIdentifier(normalized),
      bearerPn: hashIdentifier(auth.pnIdentifier),
    });
    res.status(403).json({ error: 'forbidden', reason: 'pn_mismatch' });
    return null;
  }

  const { loadPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
  const index = await loadPnDriveIndex(normalized);
  if (!isPnDriveIndexComplete(index)) {
    return {
      pnIdentifier: normalized,
      policy: defaultDevicePolicy(),
      isKeyed: false,
    };
  }

  return gateOwnerRoute(req, res, DEVICE_CAPABILITIES.profileWrite, targetPn);
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
