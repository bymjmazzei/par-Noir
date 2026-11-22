/**
 * Native / desktop session vault UI for Pen.
 */

import { useCallback, useEffect, useState } from 'react';
import { SessionVaultEnrollPrompt, SessionVaultUnlockOverlay } from '@par-noir/oauth-ui';
import type { PenSession } from '../App';
import { penSession } from '../services/penSession';
import { listLocalDocs } from '../services/penLocalStore';
import { isCapacitorNative, isPenDesktop } from '../services/penPlatform';
import {
  clearPenSessionVault,
  collectSessionDocKeys,
  enrollPenSessionVault,
  hasPenSessionVault,
  isPenSessionVaultAvailable,
  restoreDocKeysFromVault,
  unlockPenSessionVault
} from '../services/sessionVaultNative';

const DECLINED_KEY = 'pn_vault_enroll_declined_pen';

function nativeShell(): boolean {
  return isCapacitorNative() || isPenDesktop();
}

interface PenSessionVaultHostProps {
  session: PenSession | null;
}

export function PenSessionVaultHost({ session }: PenSessionVaultHostProps) {
  const [showUnlock, setShowUnlock] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!nativeShell()) return;
    let cancelled = false;
    void (async () => {
      if (!(await isPenSessionVaultAvailable())) return;
      if (session) return;
      if (await hasPenSessionVault()) {
        if (!cancelled) setShowUnlock(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (!nativeShell() || !session) return;
    let cancelled = false;
    void (async () => {
      if (!(await isPenSessionVaultAvailable())) return;
      if (await hasPenSessionVault()) return;
      if (localStorage.getItem(DECLINED_KEY) === '1') return;
      if (!cancelled) setShowEnroll(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleBiometricUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await unlockPenSessionVault();
      if (!payload || payload.kind !== 'pen_session') {
        setError('No saved session');
        return;
      }
      restoreDocKeysFromVault(payload.docKeys);
      const parsed = JSON.parse(payload.oauthSessionJson) as PenSession;
      penSession.save(parsed);
      setShowUnlock(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Biometric unlock failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleEnroll = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const docIds = listLocalDocs(session.pnIdentifier).map((d) => d.docId);
      await enrollPenSessionVault(JSON.stringify(session), collectSessionDocKeys(docIds));
      localStorage.removeItem(DECLINED_KEY);
      setShowEnroll(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not enable device unlock');
    } finally {
      setBusy(false);
    }
  }, [session]);

  if (!nativeShell()) return null;

  return (
    <>
      <SessionVaultUnlockOverlay
        open={showUnlock && !session}
        title="Unlock Pen"
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

export async function wipePenSessionVaultOnLogout(): Promise<void> {
  try {
    await clearPenSessionVault();
  } catch {
    /* ignore */
  }
}
