export type DeviceKeyType = 'software' | 'webauthn';
export type DeviceStatus = 'active' | 'revoked';
export type DeviceType = 'mobile' | 'desktop' | 'tablet' | 'other';

export interface DeviceRow {
  deviceId: string;
  devicePublicKey: string;
  label: string;
  deviceType: DeviceType;
  keyType: DeviceKeyType;
  status: DeviceStatus;
  isPrimary: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface DevicePolicy {
  version: number;
  unkeyedAllows: string[];
  firstDeviceKeyedAt?: string;
}

export interface DeviceProofPayload {
  pnIdentifier: string;
  deviceId: string;
  method: string;
  path: string;
  bodyHash: string;
  timestamp: number;
  nonce: string;
}

export type DeviceAccessMode = 'keyed' | 'unkeyed_legacy' | 'unkeyed_restricted';

export interface DeviceCapabilityResult {
  allowed: boolean;
  mode: DeviceAccessMode;
  reason?: 'device_required' | 'capability_not_allowed';
}
