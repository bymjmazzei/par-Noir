import { useCallback, useEffect, useState } from 'react';
import { PNOAuthService } from '../services/pnOAuthService';
import {
  fetchDeviceRegistry,
  keyThisDevice,
  wireLocalDeviceProofSigner,
  type DeviceRegistrySummary,
} from '../services/deviceService';
import { setDeviceProofSigner } from '@par-noir/device-client';

export function useAggregatorDeviceKeys(params: {
  pnIdentifier?: string | null;
  isUnlocked: boolean;
}) {
  const [registry, setRegistry] = useState<DeviceRegistrySummary | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [keying, setKeying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const session = PNOAuthService.loadSession();
    const pn = params.pnIdentifier || session?.pnIdentifier;
    const token = session?.accessToken;
    if (!params.isUnlocked || !pn || !token) {
      setRegistry(null);
      setLocalDeviceId(null);
      setDeviceProofSigner(null);
      return;
    }
    const wired = await wireLocalDeviceProofSigner(pn, token);
    setRegistry(wired.registry);
    setLocalDeviceId(wired.localDeviceId);
  }, [params.isUnlocked, params.pnIdentifier]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needsKeying =
    Boolean(registry?.hasKeyedDevices || registry?.policy?.firstDeviceKeyedAt) &&
    !localDeviceId;

  const keyDevice = useCallback(async () => {
    const session = PNOAuthService.loadSession();
    const pn = params.pnIdentifier || session?.pnIdentifier;
    const token = session?.accessToken;
    if (!pn || !token) return;
    setKeying(true);
    setError(null);
    try {
      const reg = await keyThisDevice({ userPnIdentifier: pn, authToken: token });
      setLocalDeviceId(reg.deviceId);
      const summary = await fetchDeviceRegistry(pn, token);
      setRegistry(summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to key device');
    } finally {
      setKeying(false);
    }
  }, [params.pnIdentifier]);

  return {
    registry,
    localDeviceId,
    isKeyed: Boolean(localDeviceId),
    needsKeying,
    keying,
    error,
    keyDevice,
    refresh,
  };
}
