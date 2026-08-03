import { API_ENDPOINT } from '../config/api';
import {
  generateDeviceKeypair,
  type DevicePolicy,
  type DeviceType,
} from '@par-noir/device-auth';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import { sealDevicePrivateDisplay } from '@par-noir/device-client';
import { deviceProofHeaders } from './deviceProofContext';
import {
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
    privateDisplay?: string;
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

function resolveSessionSecrets(sessionId: string): { pnName: string; passcode: string } {
  const creds = SecureCredentialManager.getCredentials(sessionId);
  if (!creds?.pnName || !creds?.passcode) {
    throw new Error('Unlock required to seal device display fields');
  }
  return { pnName: creds.pnName, passcode: creds.passcode };
}

async function buildPrivateDisplayBlob(params: {
  sessionId: string;
  label: string;
  deviceType: DeviceType | string;
  lastSeenAt?: string;
}): Promise<string> {
  const { pnName, passcode } = resolveSessionSecrets(params.sessionId);
  const deviceType = (params.deviceType || 'other') as DeviceType;
  return sealDevicePrivateDisplay(
    {
      label: params.label || 'Device',
      deviceType:
        deviceType === 'mobile' ||
        deviceType === 'desktop' ||
        deviceType === 'tablet' ||
        deviceType === 'other'
          ? deviceType
          : 'other',
      lastSeenAt: params.lastSeenAt || new Date().toISOString(),
    },
    pnName,
    passcode
  );
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

/** Coarse browser class only — never include pn name, email, or other PII. */
export function coarseDeviceHint(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent || '';
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return 'mobile-browser';
  if (/Macintosh|Windows|Linux|CrOS/i.test(ua)) return 'desktop-browser';
  return 'browser';
}

/** Opaque local id for dedupe; not derived from identity secrets. */
export function coarseDeviceFingerprint(): string {
  if (typeof localStorage === 'undefined') return 'default';
  const key = 'pn_unkeyed_unlock_fp';
  try {
    let fp = localStorage.getItem(key);
    if (!fp) {
      fp = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      localStorage.setItem(key, fp);
    }
    return fp;
  } catch {
    return 'default';
  }
}

export async function postUnkeyedUnlockAlert(
  userPnIdentifier: string,
  authToken: string,
  opts?: { deviceHint?: string; fingerprint?: string }
): Promise<{ success: boolean; skipped?: boolean; reason?: string }> {
  const path = '/api/devices/unkeyed-unlock-alert';
  const body = {
    userPnIdentifier,
    deviceHint: opts?.deviceHint || coarseDeviceHint(),
    fingerprint: opts?.fingerprint || coarseDeviceFingerprint(),
  };
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Failed to post unlock alert');
  }
  return res.json();
}

export async function registerDeviceOnServer(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  devicePublicKey: string;
  privateDisplay: string;
  pairingNonce?: string;
  isPrimary?: boolean;
}): Promise<{ success: boolean; deviceId: string; firstDevice: boolean }> {
  const path = '/api/devices/register';
  const body = {
    userPnIdentifier: params.userPnIdentifier,
    deviceId: params.deviceId,
    devicePublicKey: params.devicePublicKey,
    privateDisplay: params.privateDisplay,
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

export async function sendDeviceHeartbeat(params: {
  userPnIdentifier: string;
  authToken: string;
  deviceId: string;
  sessionId: string;
  label?: string;
  deviceType?: string;
}): Promise<void> {
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: params.label || 'Device',
    deviceType: params.deviceType || 'other',
    lastSeenAt: new Date().toISOString(),
  });
  const path = `/api/devices/${encodeURIComponent(params.deviceId)}/heartbeat`;
  const res = await apiFetch(params.authToken, 'POST', path, {
    userPnIdentifier: params.userPnIdentifier,
    privateDisplay,
  });
  if (!res.ok) return;
}

export async function bootstrapThisDevice(params: {
  userPnIdentifier: string;
  authToken: string;
  sessionId: string;
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
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: reg.label,
    deviceType: reg.deviceType,
  });
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

export async function completePairingFromNonce(params: {
  userPnIdentifier: string;
  authToken: string;
  sessionId: string;
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
  const privateDisplay = await buildPrivateDisplayBlob({
    sessionId: params.sessionId,
    label: reg.label,
    deviceType: reg.deviceType,
  });
  await registerDeviceOnServer({
    userPnIdentifier: params.userPnIdentifier,
    authToken: params.authToken,
    deviceId: reg.deviceId,
    devicePublicKey: reg.publicKey,
    privateDisplay,
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
