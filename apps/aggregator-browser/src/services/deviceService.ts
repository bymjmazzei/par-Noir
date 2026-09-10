/**
 * Device registry + local key bootstrap for aggregator-browser messaging gates.
 */

import { API_ENDPOINT } from '../config/api';
import {
  generateDeviceKeypair,
  type DevicePolicy,
  type DeviceType,
} from '@par-noir/device-auth';
import {
  buildLocalDeviceProofHeaders,
  loadDeviceRegistration,
  persistNewKeypair,
  sealDevicePrivateDisplay,
  setDeviceProofSigner,
  type StoredDeviceRegistration,
} from '@par-noir/device-client';
import { getDmIdentity, isDmIdentityReady } from './dmIdentitySession';

export interface DeviceRegistrySummary {
  devices: Array<{
    deviceId: string;
    label: string;
    deviceType: string;
    keyType: string;
    status: string;
    isPrimary: boolean;
    createdAt: string;
    lastSeenAt: string;
    privateDisplay?: string;
  }>;
  policy: Pick<DevicePolicy, 'unkeyedAllows' | 'firstDeviceKeyedAt'>;
  hasKeyedDevices: boolean;
}

const REGISTRY_TTL_MS = 60_000;
const registryCache = new Map<string, { at: number; value: DeviceRegistrySummary | null }>();
const registryInflight = new Map<string, Promise<DeviceRegistrySummary | null>>();

export function invalidateDeviceRegistryCache(userPnIdentifier?: string): void {
  if (userPnIdentifier) {
    registryCache.delete(userPnIdentifier);
    registryInflight.delete(userPnIdentifier);
    return;
  }
  registryCache.clear();
  registryInflight.clear();
}

export async function fetchDeviceRegistry(
  userPnIdentifier: string,
  authToken: string
): Promise<DeviceRegistrySummary | null> {
  const cached = registryCache.get(userPnIdentifier);
  if (cached && Date.now() - cached.at < REGISTRY_TTL_MS) {
    return cached.value;
  }
  const inflight = registryInflight.get(userPnIdentifier);
  if (inflight) return inflight;

  const work = (async () => {
    const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/registry`;
    const res = await fetch(`${API_ENDPOINT}${path}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const value = res.ok ? ((await res.json()) as DeviceRegistrySummary) : null;
    registryCache.set(userPnIdentifier, { at: Date.now(), value });
    return value;
  })().finally(() => {
    registryInflight.delete(userPnIdentifier);
  });

  registryInflight.set(userPnIdentifier, work);
  return work;
}

async function registerDeviceOnServer(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  devicePublicKey: string;
  privateDisplay: string;
  isPrimary?: boolean;
}): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}/api/devices/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.authToken}`,
    },
    body: JSON.stringify({
      userPnIdentifier: params.userPnIdentifier,
      deviceId: params.deviceId,
      devicePublicKey: params.devicePublicKey,
      privateDisplay: params.privateDisplay,
      isPrimary: params.isPrimary,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to register device');
  }
}

export async function bootstrapThisDevice(params: {
  userPnIdentifier: string;
  authToken: string;
  label?: string;
  deviceType?: StoredDeviceRegistration['deviceType'];
}): Promise<StoredDeviceRegistration> {
  if (!isDmIdentityReady()) {
    throw new Error('Unlock messaging identity before keying this device');
  }
  const identity = getDmIdentity();
  // OAuth ML-KEM handoff may omit Key1/Key2; seal privateDisplay with ML-KEM material.
  const pnName = (identity.pnName && identity.pnName.trim()) || 'browser';
  const passcode = identity.passcode || identity.mlKemSecretKey;
  if (!passcode) {
    throw new Error('Unlock messaging before keying this device');
  }
  const keypair = await generateDeviceKeypair();
  const label = params.label ?? 'Browser';
  const deviceType = (params.deviceType ?? 'other') as DeviceType;
  const reg = await persistNewKeypair({
    pnIdentifier: params.userPnIdentifier,
    deviceId: keypair.deviceId,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    label,
    deviceType,
  });
  const privateDisplay = await sealDevicePrivateDisplay(
    {
      label,
      deviceType,
      lastSeenAt: new Date().toISOString(),
    },
    pnName,
    passcode
  );
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    privateDisplay,
    isPrimary: true,
  });
  return reg;
}

export async function wireLocalDeviceProofSigner(
  userPnIdentifier: string,
  authToken: string
): Promise<{ localDeviceId: string | null; registry: DeviceRegistrySummary | null }> {
  const [registry, localReg] = await Promise.all([
    fetchDeviceRegistry(userPnIdentifier, authToken),
    loadDeviceRegistration(userPnIdentifier),
  ]);

  const active =
    localReg?.deviceId &&
    registry?.devices.some((d) => d.deviceId === localReg.deviceId && d.status === 'active');

  if (active) {
    setDeviceProofSigner((method, path, body) =>
      buildLocalDeviceProofHeaders(userPnIdentifier, method, path, body)
    );
  } else {
    setDeviceProofSigner(null);
  }

  return { localDeviceId: active ? localReg!.deviceId : null, registry };
}

export async function keyThisDevice(params: {
  userPnIdentifier: string;
  authToken: string;
}): Promise<StoredDeviceRegistration> {
  const reg = await bootstrapThisDevice({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    label: 'Browser',
    deviceType: 'other',
  });
  invalidateDeviceRegistryCache(params.userPnIdentifier);
  setDeviceProofSigner((method, path, body) =>
    buildLocalDeviceProofHeaders(params.userPnIdentifier, method, path, body)
  );
  return reg;
}

/**
 * Case B (identity already has keyed devices): mailbox drain requires a local
 * device proof. Fresh browser profiles have none — key this browser so Accept
 * / inbox drain is not a silent empty. Case A (no keyed devices) can drain
 * without registering.
 */
export async function ensureMailboxCapableDevice(params: {
  userPnIdentifier: string;
  authToken: string;
}): Promise<{ keyed: boolean; reason: string }> {
  const { localDeviceId, registry } = await wireLocalDeviceProofSigner(
    params.userPnIdentifier,
    params.authToken
  );
  if (localDeviceId) return { keyed: true, reason: 'local_device_active' };
  if (!registry?.hasKeyedDevices) {
    return { keyed: false, reason: 'case_a_unkeyed_ok' };
  }
  if (!isDmIdentityReady()) {
    return { keyed: false, reason: 'dm_identity_not_ready' };
  }
  try {
    await keyThisDevice(params);
    return { keyed: true, reason: 'keyed_this_browser' };
  } catch (e) {
    console.warn(
      '[ensureMailboxCapableDevice] failed to key browser for Case B drain:',
      e instanceof Error ? e.message : e
    );
    return { keyed: false, reason: 'key_failed' };
  }
}
