/**
 * Native session vault UI for Prism (biometric gate + enroll).
 */

import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SessionVaultEnrollPrompt, SessionVaultUnlockOverlay } from '@par-noir/oauth-ui';
import type { PrismSession } from '../services/prismAuthService';
import { saveSession as persistPrismSession } from '../services/prismAuthService';
import {
  clearPrismSessionVault,
  enrollPrismSessionVault,
  hasPrismSessionVault,
  isPrismSessionVaultAvailable,
  unlockPrismSessionVault,
} from '../services/sessionVaultNative';

const DECLINED_KEY = 'pn_vault_enroll_declined_prism';

interface PrismSessionVaultHostProps {
  session: PrismSession | null;
  onSession: (s: PrismSession | null) => void;
  onLoadingDone: () => void;
}

export function PrismSessionVaultHost({
  session,
  onSession,
  onLoadingDone,
}: PrismSessionVaultHostProps) {
  const [showUnlock, setShowUnlock] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setBootDone(true);
      onLoadingDone();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!(await isPrismSessionVaultAvailable())) return;
        if (session) return;
        if (await hasPrismSessionVault()) {
          if (!cancelled) setShowUnlock(true);
        }
      } finally {
        if (!cancelled) {
          setBootDone(true);
          onLoadingDone();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, onLoadingDone]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !bootDone || session) return;
    let cancelled = false;
    void (async () => {
      if (await hasPrismSessionVault()) {
        if (!cancelled) setShowUnlock(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, bootDone]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !session || !bootDone) return;
    let cancelled = false;
    void (async () => {
      if (!(await isPrismSessionVaultAvailable())) return;
      if (await hasPrismSessionVault()) return;
      if (localStorage.getItem(DECLINED_KEY) === '1') return;
      if (!cancelled) setShowEnroll(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session, bootDone]);

  const handleBiometricUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await unlockPrismSessionVault();
      if (!payload || payload.kind !== 'prism_session') {
        setError('No saved session');
        return;
      }
      const s = JSON.parse(payload.sessionJson) as PrismSession;
      await persistPrismSession(s);
      onSession(s);
      setShowUnlock(false);
    } catch (e: any) {
      setError(e?.message || 'Biometric unlock failed');
    } finally {
      setBusy(false);
    }
  }, [onSession]);

  const handleEnroll = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await enrollPrismSessionVault(JSON.stringify(session));
      localStorage.removeItem(DECLINED_KEY);
      setShowEnroll(false);
    } catch (e: any) {
      setError(e?.message || 'Could not enable device unlock');
    } finally {
      setBusy(false);
    }
  }, [session]);

  if (!Capacitor.isNativePlatform()) return null;

  return (
    <>
      <SessionVaultUnlockOverlay
        open={showUnlock && !session}
        title="Unlock Prism"
        busy={busy}
        error={error}
        onUnlock={handleBiometricUnlock}
        onUseFullUnlock={() => {
          setShowUnlock(false);
          setError(null);
        }}
      />
      <SessionVaultEnrollPrompt
        open={showEnroll && !!session}
        busy={busy}
        error={error}
        onConfirm={handleEnroll}
        onDecline={() => {
          localStorage.setItem(DECLINED_KEY, '1');
          setShowEnroll(false);
        }}
      />
    </>
  );
}

export async function wipePrismSessionVaultOnLogout(): Promise<void> {
  try {
    await clearPrismSessionVault();
  } catch {
    /* ignore */
  }
}
