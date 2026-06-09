import {
  hashRequestBody,
  signDeviceProof,
  type DeviceProofPayload,
} from '@par-noir/device-auth';
import { importStoredPrivateKey, loadDeviceRegistration } from './deviceKeyStorage';

export async function buildLocalDeviceProofHeaders(
  pnIdentifier: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Record<string, string>> {
  const reg = await loadDeviceRegistration(pnIdentifier);
  if (!reg) return {};
  const privateKey = await importStoredPrivateKey(reg);
  const bodyHash = await hashRequestBody(body);
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const payload: DeviceProofPayload = {
    pnIdentifier,
    deviceId: reg.deviceId,
    method,
    path,
    bodyHash,
    timestamp,
    nonce,
  };
  const signature = await signDeviceProof(privateKey, payload);
  return {
    'X-PN-Device-Id': reg.deviceId,
    'X-PN-Device-Signature': signature,
    'X-PN-Device-Timestamp': String(timestamp),
    'X-PN-Device-Nonce': nonce,
  };
}
