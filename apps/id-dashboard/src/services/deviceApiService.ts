import { API_ENDPOINT } from '../config/api';
import {
  generateDeviceKeypair,
  type DevicePolicy,
} from '@par-noir/device-auth';
import { deviceProofHeaders } from './deviceProofContext';
import {
  importStoredPrivateKey,
  loadDeviceRegistration,
  persistNewKeypair,
  type StoredDeviceRegistration,
} from './deviceKeyStorage';
import { buildLocalDeviceProofHeaders as buildProofHeaders } from '@par-noir/device-client';

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
  }>;
  policy: Pick<DevicePolicy, 'unkeyedAllows' | 'firstDeviceKeyedAt'>;
  hasKeyedDevices: boolean;
}

function authHeaders(authToken: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
    ...extra,
  };
}

async function apiFetch(
  authToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const proof = await deviceProofHeaders(method, path, body);
  return fetch(`${API_ENDPOINT}${path}`, {
    method,
    headers: authHeaders(authToken, proof),
    body: body != null ? JSON.stringify(body) : undefined,
  });
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

export async function fetchDevicePolicy(
  userPnIdentifier: string,
  authToken: string
): Promise<DevicePolicy | null> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/policy`;
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.policy ?? null;
}

export async function updateDevicePolicy(
  userPnIdentifier: string,
  authToken: string,
  unkeyedAllows: string[]
): Promise<DevicePolicy> {
  const path = `/api/devices/${encodeURIComponent(userPnIdentifier)}/policy`;
  const body = { unkeyedAllows };
  const res = await apiFetch(authToken, 'PATCH', path, body);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to update device policy');
  }
  const data = await res.json();
  return data.policy;
}

export async function createPairingNonce(
  userPnIdentifier: string,
  authToken: string
): Promise<{ pairingNonce: string; expiresAt: string }> {
  const path = '/api/devices/pairing/nonce';
  const res = await apiFetch(authToken, 'POST', path, { userPnIdentifier });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to create pairing nonce');
  }
  return res.json();
}

export async function registerDeviceOnServer(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  devicePublicKey: string;
  label?: string;
  deviceType?: string;
  pairingNonce?: string;
  isPrimary?: boolean;
}): Promise<{ success: boolean; deviceId: string; firstDevice: boolean }> {
  const path = '/api/devices/register';
  const body = {
    userPnIdentifier: params.userPnIdentifier,
    deviceId: params.deviceId,
    devicePublicKey: params.devicePublicKey,
    label: params.label,
    deviceType: params.deviceType,
    pairingNonce: params.pairingNonce,
    isPrimary: params.isPrimary,
  };
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(params.authToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to register device');
  }
  return res.json();
}

export async function revokeDeviceOnServer(
  userPnIdentifier: string,
  authToken: string,
  deviceId: string
): Promise<void> {
  const path = `/api/devices/${encodeURIComponent(deviceId)}/revoke`;
  const res = await apiFetch(authToken, 'POST', path, { userPnIdentifier });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to revoke device');
  }
}

export async function sendDeviceHeartbeat(
  userPnIdentifier: string,
  authToken: string,
  deviceId: string
): Promise<void> {
  const path = `/api/devices/${encodeURIComponent(deviceId)}/heartbeat`;
  const res = await apiFetch(authToken, 'POST', path, { userPnIdentifier });
  if (!res.ok) return;
}

export async function bootstrapThisDevice(params: {
  userPnIdentifier: string;
  authToken: string;
  label?: string;
  deviceType?: StoredDeviceRegistration['deviceType'];
}): Promise<StoredDeviceRegistration> {
  const keypair = await generateDeviceKeypair();
  const reg = await persistNewKeypair({
    pnIdentifier: params.userPnIdentifier,
    deviceId: keypair.deviceId,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    label: params.label,
    deviceType: params.deviceType,
  });
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    label: reg.label,
    deviceType: reg.deviceType,
    isPrimary: true,
  });
  return reg;
}

export async function completePairingFromNonce(params: {
  userPnIdentifier: string;
  authToken: string;
  pairingNonce: string;
  label?: string;
}): Promise<StoredDeviceRegistration> {
  const keypair = await generateDeviceKeypair();
  const reg = await persistNewKeypair({
    pnIdentifier: params.userPnIdentifier,
    deviceId: keypair.deviceId,
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    label: params.label,
  });
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    label: reg.label,
    deviceType: reg.deviceType,
    pairingNonce: params.pairingNonce,
  });
  return reg;
}

export async function buildLocalDeviceProofHeaders(
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, string>> {
  return buildProofHeaders(pnIdentifier, method, path, body);
}

export async function getLocalDeviceRegistration(
  pnIdentifier: string
): Promise<Pick<StoredDeviceRegistration, 'deviceId' | 'publicKey' | 'label'> | null> {
  const reg = await loadDeviceRegistration(pnIdentifier);
  if (!reg) return null;
  return { deviceId: reg.deviceId, publicKey: reg.publicKey, label: reg.label };
}
