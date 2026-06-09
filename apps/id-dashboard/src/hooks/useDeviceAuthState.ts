import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEVICE_CAPABILITIES,
  evaluateDeviceCapability,
  normalizeDevicePolicy,
  type DeviceCapabilityId,
  type DevicePolicy,
} from '@par-noir/device-auth';
import {
  buildLocalDeviceProofHeaders,
  fetchDeviceRegistry,
  type DeviceRegistrySummary,
} from '../services/deviceApiService';
import { loadDeviceRegistration } from '../services/deviceKeyStorage';
import { setDeviceProofSigner } from '../services/deviceProofContext';

const PENDING_PAIRING_KEY = 'pn_pending_device_pairing';

export interface PendingDevicePairing {
  pairingNonce: string;
  pnIdentifier: string;
  expiresAt: string;
}

export function parseDevicePairingFromUrl(): PendingDevicePairing | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('device-pairing');
    if (!raw) return null;
    const data = JSON.parse(decodeURIComponent(raw)) as PendingDevicePairing;
    if (!data?.pairingNonce || !data?.pnIdentifier) return null;
    if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function stashPendingDevicePairing(data: PendingDevicePairing): void {
  sessionStorage.setItem(PENDING_PAIRING_KEY, JSON.stringify(data));
}

export function readPendingDevicePairing(): PendingDevicePairing | null {
  try {
    const raw = sessionStorage.getItem(PENDING_PAIRING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingDevicePairing;
    if (data.expiresAt && Date.parse(data.expiresAt) < Date.now()) {
      sessionStorage.removeItem(PENDING_PAIRING_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPendingDevicePairing(): void {
  sessionStorage.removeItem(PENDING_PAIRING_KEY);
}

export function useDeviceAuthState(params: {
  apiToken?: string | null;
  userPnIdentifier?: string | null;
}) {
  const [registry, setRegistry] = useState<DeviceRegistrySummary | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingPairing, setPendingPairing] = useState<PendingDevicePairing | null>(() => {
    const fromUrl = parseDevicePairingFromUrl();
    if (fromUrl) {
      stashPendingDevicePairing(fromUrl);
      return fromUrl;
    }
    return readPendingDevicePairing();
  });

  const policy: DevicePolicy = useMemo(
    () => normalizeDevicePolicy(registry?.policy),
    [registry?.policy]
  );

  const isKeyedSession = Boolean(
    localDeviceId
    && registry?.devices.some((d) => d.deviceId === localDeviceId && d.status === 'active')
  );

  const hasKeyedDevices = registry?.hasKeyedDevices ?? false;
  const isUnkeyedRestricted = Boolean(policy.firstDeviceKeyedAt && !isKeyedSession);

  const refresh = useCallback(async () => {
    if (!params.apiToken || !params.userPnIdentifier) {
      setRegistry(null);
      setLocalDeviceId(null);
      setDeviceProofSigner(null);
      return;
    }
    setLoading(true);
    try {
      const [summary, localReg] = await Promise.all([
        fetchDeviceRegistry(params.userPnIdentifier, params.apiToken),
        loadDeviceRegistration(params.userPnIdentifier),
      ]);
      setRegistry(summary);
      setLocalDeviceId(localReg?.deviceId ?? null);

      if (localReg?.deviceId && summary?.devices.some((d) => d.deviceId === localReg.deviceId && d.status === 'active')) {
        setDeviceProofSigner((method, path, body) =>
          buildLocalDeviceProofHeaders(params.userPnIdentifier!, method, path, body)
        );
      } else {
        setDeviceProofSigner(null);
      }
    } finally {
      setLoading(false);
    }
  }, [params.apiToken, params.userPnIdentifier]);

  useEffect(() => {
    void refresh();
    return () => setDeviceProofSigner(null);
  }, [refresh]);

  const can = useCallback(
    (capability: DeviceCapabilityId | string) =>
      evaluateDeviceCapability({
        policy,
        isKeyed: isKeyedSession,
        capability,
      }).allowed,
    [policy, isKeyedSession]
  );

  const deviceRequiredMessage =
    'This action requires a keyed device. Key this device or use a device you have already registered.';

  return {
    registry,
    policy,
    loading,
    refresh,
    isKeyedSession,
    hasKeyedDevices,
    isUnkeyedRestricted,
    localDeviceId,
    pendingPairing,
    setPendingPairing,
    can,
    deviceRequiredMessage,
    capabilities: DEVICE_CAPABILITIES,
  };
}
