/**
 * Native biometric (Face ID / Touch ID / fingerprint) for Prism.
 * Use for session unlock when returning from background.
 */

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@bytetrade/capacitor-native-biometric';

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function isAvailable(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

export async function verifyIdentity(reason?: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await NativeBiometric.verifyIdentity({
      reason: reason ?? 'Unlock Prism',
      title: 'Biometric authentication',
    });
    return true;
  } catch {
    return false;
  }
}
