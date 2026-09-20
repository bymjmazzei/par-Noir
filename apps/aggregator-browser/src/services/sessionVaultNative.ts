/**
 * Capacitor Keychain session vault for browse / messaging.
 */

import { Capacitor } from '@capacitor/core';
import {
  createDeviceSessionVault,
  capacitorSecureStorageKv,
  UnsupportedSessionVault,
  type DeviceSessionVault,
  type BrowseOauthPayload,
  type MessagingSessionPayload,
  type SessionVaultPayload,
  type SessionVaultAppId,
} from '@par-noir/device-session-vault';
import { MESSAGING_ONLY } from '../config/buildFlags';

function appId(): SessionVaultAppId {
  return MESSAGING_ONLY ? 'messaging' : 'browse';
}

let vaultSingleton: DeviceSessionVault | UnsupportedSessionVault | null = null;

async function getVault(): Promise<DeviceSessionVault | UnsupportedSessionVault> {
  if (vaultSingleton) return vaultSingleton;
  try {
    if (!Capacitor.isNativePlatform()) {
      vaultSingleton = new UnsupportedSessionVault();
      return vaultSingleton;
    }
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    const { NativeBiometric } = await import('@bytetrade/capacitor-native-biometric');
    vaultSingleton = createDeviceSessionVault({
      kv: capacitorSecureStorageKv(SecureStoragePlugin as any),
      verifyBiometric: async (reason) => {
        try {
          await NativeBiometric.verifyIdentity({
            reason,
            title: 'par Noir',
          });
          return true;
        } catch {
          return false;
        }
      },
      isBiometricAvailable: async () => {
        try {
          const r = await NativeBiometric.isAvailable();
          return !!r.isAvailable;
        } catch {
          return false;
        }
      },
    });
    return vaultSingleton;
  } catch {
    vaultSingleton = new UnsupportedSessionVault();
    return vaultSingleton;
  }
}

export async function isBrowserSessionVaultAvailable(): Promise<boolean> {
  const v = await getVault();
  return v.isAvailable();
}

export async function hasBrowserSessionVault(): Promise<boolean> {
  const v = await getVault();
  return v.hasVault(appId());
}

export async function enrollBrowserOauthVault(oauthSessionJson: string): Promise<void> {
  const v = await getVault();
  const id = appId();
  if (id === 'messaging') {
    const payload: MessagingSessionPayload = {
      kind: 'messaging_session',
      oauthSessionJson,
      dmSessionJson: null,
    };
    await v.enrollAfterUnlock(id, payload);
    return;
  }
  const payload: BrowseOauthPayload = {
    kind: 'browse_oauth',
    oauthSessionJson,
  };
  await v.enrollAfterUnlock(id, payload);
}

export async function updateMessagingVaultDmSession(
  oauthSessionJson: string,
  dmSessionJson: string | null
): Promise<void> {
  if (!MESSAGING_ONLY) return;
  const v = await getVault();
  if (!(await v.hasVault('messaging'))) return;
  const payload: MessagingSessionPayload = {
    kind: 'messaging_session',
    oauthSessionJson,
    dmSessionJson,
  };
  if ('updateWhileUnlocked' in v) {
    try {
      await v.updateWhileUnlocked('messaging', payload);
      return;
    } catch {
      /* fall through to enroll with biometric */
    }
  }
  await v.enrollAfterUnlock('messaging', payload, 'Confirm to update saved messaging session');
}

export async function unlockBrowserSessionVault(): Promise<SessionVaultPayload | null> {
  const v = await getVault();
  return v.unlockWithBiometric(appId());
}

export async function clearBrowserSessionVault(): Promise<void> {
  const v = await getVault();
  await v.clearVault(appId());
}
