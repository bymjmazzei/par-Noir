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

export async function fetchDeviceRegistry(
  userPnIdentifier: string,
  authToken: string
): Promise<DeviceRegistrySummary | null> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/registry`;
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  return res.json();
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
  if (!identity.pnName || !identity.passcode) {
    throw new Error('Unlock messaging with your passcode before keying this device');
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
    identity.pnName,
    identity.passcode
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
  setDeviceProofSigner((method, path, body) =>
    buildLocalDeviceProofHeaders(params.userPnIdentifier, method, path, body)
  );
  return reg;
}
