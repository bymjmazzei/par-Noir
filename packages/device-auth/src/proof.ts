import type { DeviceProofPayload } from './types';

/** Canonical string signed by device private keys (v1). */
export function serializeDeviceProofPayload(payload: DeviceProofPayload): string {
  const ordered = {
    bodyHash: payload.bodyHash,
    deviceId: payload.deviceId,
    method: payload.method.toUpperCase(),
    nonce: payload.nonce,
    path: payload.path,
    pnIdentifier: payload.pnIdentifier,
    timestamp: payload.timestamp,
  };
  return JSON.stringify(ordered);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashRequestBody(body: unknown): Promise<string> {
  if (body == null) return await sha256Hex('');
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return sha256Hex(text);
}

/** Max clock skew for device proof timestamps (5 minutes). */
export const DEVICE_PROOF_MAX_SKEW_MS = 5 * 60 * 1000;

export function isDeviceProofTimestampValid(timestamp: number, now = Date.now()): boolean {
  if (!Number.isFinite(timestamp)) return false;
  return Math.abs(now - timestamp) <= DEVICE_PROOF_MAX_SKEW_MS;
}
