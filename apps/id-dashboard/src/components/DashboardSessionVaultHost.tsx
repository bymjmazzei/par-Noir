/**
 * Native session vault UI + restore/enroll for id-dashboard.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import { SessionVaultEnrollPrompt, SessionVaultUnlockOverlay } from '@par-noir/oauth-ui';
import type { SecureStorage } from '../utils/storage';
import {
  clearDashboardSessionVault,
  enrollDashboardSessionVault,
  hasDashboardSessionVault,
  isDashboardSessionVaultAvailable,
  unlockDashboardSessionVault,
} from '../services/sessionVaultNative';

const DECLINED_KEY = 'pn_vault_enroll_declined_dashboard';

interface DashboardSessionVaultHostProps {
  storage: SecureStorage;
  authenticatedUser: { id?: string; publicKey?: string; nickname?: string } | null;
  onAuthSuccess: (session: any) => Promise<void>;
}

export function DashboardSessionVaultHost({
  storage,
  authenticatedUser,
  onAuthSuccess,
}: DashboardSessionVaultHostProps) {
  const [showUnlock, setShowUnlock] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setChecked(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (!(await isDashboardSessionVaultAvailable())) {
          if (!cancelled) setChecked(true);
          return;
        }
        if (authenticatedUser) {
          if (!cancelled) setChecked(true);
          return;
        }
        if (await hasDashboardSessionVault()) {
          if (!cancelled) setShowUnlock(true);
        }
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || authenticatedUser || !checked) return;
    let cancelled = false;
    void (async () => {
      if (await hasDashboardSessionVault()) {
        if (!cancelled) setShowUnlock(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser, checked]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !authenticatedUser?.id || !checked) return;
    if (showUnlock) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await isDashboardSessionVaultAvailable())) return;
        if (await hasDashboardSessionVault()) return;
        if (localStorage.getItem(DECLINED_KEY) === '1') return;
        if (!cancelled) setShowEnroll(true);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUser?.id, checked, showUnlock]);

  const handleBiometricUnlock = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = await unlockDashboardSessionVault();
      if (!payload || payload.kind !== 'dashboard_keys') {
        setError('No saved session. Use full unlock.');
        return;
      }
      const stored = await storage.getIdentity(payload.publicKey);
      if (!stored?.encryptedData) {
        await clearDashboardSessionVault();
        setError('Saved identity missing. Use full unlock.');
        setShowUnlock(false);
        return;
      }
      const authSession = await IdentityCrypto.authenticateIdentity(
        {
          encryptedData: stored.encryptedData,
          iv: stored.iv,
          salt: stored.salt,
          publicKey: stored.publicKey,
        } as any,
        payload.passcode,
        payload.pnName
      );
      await onAuthSuccess({
        ...authSession,
        pnName: payload.pnName,
        passcode: payload.passcode,
        nickname: payload.nickname || authSession.nickname,
        publicKey: payload.publicKey || authSession.publicKey,
        id: payload.identityId || authSession.id,
      });
      setShowUnlock(false);
    } catch (e: any) {
      setError(e?.message || 'Biometric unlock failed');
    } finally {
      setBusy(false);
    }
  }, [onAuthSuccess, storage]);

  const handleEnroll = useCallback(async () => {
    if (!authenticatedUser?.id) return;
    setBusy(true);
    setError(null);
    try {
      const { SecureCredentialManager } = await import('@par-noir/identity-crypto');
      const creds = SecureCredentialManager.getCredentials(authenticatedUser.id);
      if (!creds || !authenticatedUser.publicKey) {
        setError('Credentials not available to save');
        return;
      }
      await enrollDashboardSessionVault({
        kind: 'dashboard_keys',
        identityId: authenticatedUser.id,
        publicKey: authenticatedUser.publicKey,
        pnName: creds.pnName,
        passcode: creds.passcode,
        nickname: authenticatedUser.nickname,
      });
      localStorage.removeItem(DECLINED_KEY);
      setShowEnroll(false);
    } catch (e: any) {
      setError(e?.message || 'Could not enable device unlock');
    } finally {
      setBusy(false);
    }
  }, [authenticatedUser]);

  if (!Capacitor.isNativePlatform()) return null;

  return (
    <>
      <SessionVaultUnlockOverlay
        open={showUnlock && !authenticatedUser}
        title="Unlock dashboard"
        body="Use Face ID, fingerprint, or your device passcode to restore your session."
        busy={busy}
        error={error}
        onUnlock={handleBiometricUnlock}
        onUseFullUnlock={() => {
          setShowUnlock(false);
          setError(null);
        }}
      />
      <SessionVaultEnrollPrompt
        open={showEnroll && !!authenticatedUser}
        busy={busy}
        error={error}
        onConfirm={handleEnroll}
        onDecline={() => {
          localStorage.setItem(DECLINED_KEY, '1');
          setShowEnroll(false);
          setError(null);
        }}
      />
    </>
  );
}

/** Call from logout / forget-device. */
export async function wipeDashboardSessionVaultOnLogout(): Promise<void> {
  try {
    await clearDashboardSessionVault();
  } catch {
    /* ignore */
  }
}
