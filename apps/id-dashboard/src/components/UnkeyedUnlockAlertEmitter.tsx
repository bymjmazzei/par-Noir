import { useEffect, useRef } from 'react';
import { postUnkeyedUnlockAlert } from '../services/deviceApiService';

export interface UnkeyedUnlockAlertEmitterProps {
  apiToken: string | null;
  pnIdentifier: string | null;
  hasKeyedDevices: boolean;
  isKeyedSession: boolean;
  /** When registry finished first load for this unlock session */
  registryReady: boolean;
}

/**
 * Once per unlock session: if this browser is unkeyed but the pN already has keyed
 * devices, notify the owner's Drive/portable notifications store.
 */
export function UnkeyedUnlockAlertEmitter({
  apiToken,
  pnIdentifier,
  hasKeyedDevices,
  isKeyedSession,
  registryReady,
}: UnkeyedUnlockAlertEmitterProps) {
  const firedForPn = useRef<string | null>(null);

  useEffect(() => {
    if (!registryReady || !apiToken || !pnIdentifier) return;
    if (!hasKeyedDevices || isKeyedSession) return;
    if (firedForPn.current === pnIdentifier) return;
    firedForPn.current = pnIdentifier;
    void postUnkeyedUnlockAlert(pnIdentifier, apiToken).catch(() => {
      /* best-effort; keyed device may still learn via reconnect UX */
    });
  }, [apiToken, pnIdentifier, hasKeyedDevices, isKeyedSession, registryReady]);

  useEffect(() => {
    if (!pnIdentifier) firedForPn.current = null;
  }, [pnIdentifier]);

  return null;
}
