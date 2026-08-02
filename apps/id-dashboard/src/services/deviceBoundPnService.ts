import {
  deriveDeviceBindingFactor,
  isDeviceBoundPnEnvelope,
  type DeviceBoundPnBinding,
  type DeviceBoundPnEnvelope,
} from '@par-noir/device-auth';
import { IdentityCrypto, type AuthSession, type EncryptedData } from '@par-noir/identity-crypto';
import {
  loadDeviceRegistration,
  loadDeviceRegistrationByDeviceId,
  type StoredDeviceRegistration,
} from './deviceKeyStorage';

export { isDeviceBoundPnEnvelope, type DeviceBoundPnBinding, type DeviceBoundPnEnvelope };

export const DEVICE_BOUND_PN_ERROR =
  'This backup requires the device that created it. Use a portable backup or Shamir recovery.';

function toEncryptedData(identity: Record<string, unknown>): EncryptedData {
  const encrypted = (identity.encrypted ?? identity.encryptedData) as string;
  const iv = identity.iv as string;
  const salt = identity.salt as string;
  if (!encrypted || !iv || !salt) {
    throw new Error('Invalid device-bound pN file: missing encrypted payload');
  }
  return { encrypted, iv, salt };
}

async function resolveLocalDeviceRegistration(
  binding: DeviceBoundPnBinding,
  pnIdentifier?: string | null
): Promise<StoredDeviceRegistration> {
  let reg: StoredDeviceRegistration | null = null;
  if (pnIdentifier) {
    reg = await loadDeviceRegistration(pnIdentifier);
    if (reg && reg.deviceId !== binding.deviceId) {
      reg = null;
    }
  }
  if (!reg) {
    reg = await loadDeviceRegistrationByDeviceId(binding.deviceId);
  }
  if (!reg) {
    throw new Error(DEVICE_BOUND_PN_ERROR);
  }
  if (reg.deviceId !== binding.deviceId || reg.publicKey !== binding.devicePublicKey) {
    throw new Error(DEVICE_BOUND_PN_ERROR);
  }
  return reg;
}

export async function checkDeviceBoundPnUnlockAvailable(
  envelope: DeviceBoundPnEnvelope,
  pnIdentifier?: string | null
): Promise<boolean> {
  if (!envelope.binding) return false;
  try {
    await resolveLocalDeviceRegistration(envelope.binding, pnIdentifier);
    return true;
  } catch {
    return false;
  }
}

export async function createDeviceBoundPnExport(params: {
  pnIdentifier: string;
  deviceId: string;
  identityToExport: { encryptedData: string; iv: string; salt: string; publicKey?: string };
  pnName: string;
  passcode: string;
  nickname?: string;
}): Promise<DeviceBoundPnEnvelope> {
  const reg = await loadDeviceRegistration(params.pnIdentifier);
  if (!reg || reg.deviceId !== params.deviceId) {
    throw new Error('Key this device before creating a device-bound backup.');
  }

  const encryptedData: EncryptedData = {
    encrypted: params.identityToExport.encryptedData,
    iv: params.identityToExport.iv,
    salt: params.identityToExport.salt,
  };

  const plaintext = await IdentityCrypto.decryptData(encryptedData, params.pnName, params.passcode);
  const bindingFactor = await deriveDeviceBindingFactor(reg.privateKeyPkcs8, reg.deviceId);
  const boundEncrypted = await IdentityCrypto.encryptDataWithBinding(
    plaintext,
    params.pnName,
    params.passcode,
    bindingFactor
  );

  const identityRecord: Record<string, string> = {
    encryptedData: boundEncrypted.encrypted,
    iv: boundEncrypted.iv,
    salt: boundEncrypted.salt,
  };
  if (params.identityToExport.publicKey) {
    identityRecord.publicKey = params.identityToExport.publicKey;
  }

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    binding: {
      type: 'device',
      deviceId: reg.deviceId,
      devicePublicKey: reg.publicKey,
    },
    identities: [identityRecord],
  };
}

export async function authenticateDeviceBoundPn(params: {
  envelope: DeviceBoundPnEnvelope;
  pnName: string;
  passcode: string;
  pnIdentifier?: string | null;
}): Promise<{ authSession: AuthSession; identityRecord: Record<string, unknown>; identity: Record<string, unknown> }> {
  if (!params.envelope.binding || params.envelope.binding.type !== 'device') {
    throw new Error('Not a device-bound pN file');
  }
  const identityRecord = params.envelope.identities[0];
  if (!identityRecord) {
    throw new Error('Invalid device-bound pN file format');
  }

  const reg = await resolveLocalDeviceRegistration(params.envelope.binding, params.pnIdentifier);
  const bindingFactor = await deriveDeviceBindingFactor(reg.privateKeyPkcs8, reg.deviceId);
  const encryptedData = toEncryptedData(identityRecord);

  const plaintext = await IdentityCrypto.decryptDataWithBinding(
    encryptedData,
    params.pnName,
    params.passcode,
    bindingFactor
  );

  const identity = JSON.parse(plaintext) as Record<string, unknown>;
  const publicKey = (identityRecord.publicKey as string) || (identity.publicKey as string);
  if (!publicKey) {
    throw new Error('Invalid pN file: missing public key');
  }

  const authSession = await IdentityCrypto.buildAuthSessionFromDecrypted(
    identity as { id: string; username: string; nickname?: string },
    publicKey,
    params.pnName,
    params.passcode
  );

  return { authSession, identityRecord, identity };
}
