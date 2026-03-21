/**
 * Biometric adapter: native plugin (Face ID / Touch ID / fingerprint) on Capacitor,
 * WebAuthn fallback on web/PWA.
 */

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@bytetrade/capacitor-native-biometric';
import { BiometricAuth } from './biometric';

export interface BiometricAuthResult {
  success: boolean;
  credentialId?: string;
  error?: string;
  fallbackToPasscode?: boolean;
}

export interface BiometricCapabilityInfo {
  available: boolean;
  types: string[];
  deviceName: string;
  supportedFeatures: string[];
}

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Check if biometric authentication is available.
 */
export async function isAvailable(): Promise<boolean> {
  if (isNative()) {
    try {
      const result = await NativeBiometric.isAvailable();
      return result.isAvailable;
    } catch {
      return false;
    }
  }
  return BiometricAuth.isAvailable();
}

/**
 * Authenticate with biometrics.
 * On native: verifies identity only (no credential lookup).
 * On web: uses WebAuthn with stored credentials for identityId.
 */
export async function authenticate(options?: {
  identityId?: string;
  reason?: string;
}): Promise<BiometricAuthResult> {
  if (isNative()) {
    try {
      await NativeBiometric.verifyIdentity({
        reason: options?.reason ?? 'Unlock your par Noir identity',
        title: 'Biometric authentication',
      });
      return { success: true };
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      // User cancel, fallback, etc. - offer passcode
      const fallbackCodes = [11, 15, 16, 17]; // APP_CANCEL, SYSTEM_CANCEL, USER_CANCEL, USER_FALLBACK
      return {
        success: false,
        error: 'Biometric authentication failed',
        fallbackToPasscode: fallbackCodes.includes(code ?? -1) || true,
      };
    }
  }
  const identityId = options?.identityId;
  if (!identityId) {
    return {
      success: false,
      error: 'Identity required for web biometric authentication',
      fallbackToPasscode: true,
    };
  }
  return BiometricAuth.authenticate(identityId);
}

/**
 * Get capability info for BiometricSetup UI.
 */
export async function getCapabilityInfo(): Promise<BiometricCapabilityInfo> {
  if (isNative()) {
    try {
      const result = await NativeBiometric.isAvailable();
      const types: string[] = [];
      if (result.biometryType === 1) types.push('Touch ID');
      else if (result.biometryType === 2) types.push('Face ID');
      else if (result.biometryType === 3) types.push('Fingerprint');
      else if (result.biometryType === 4) types.push('Face');
      else if (result.biometryType === 5) types.push('Iris');
      else if (result.biometryType === 6) types.push('Multiple');
      return {
        available: result.isAvailable,
        types,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        supportedFeatures: types.length ? types : ['Biometric'],
      };
    } catch {
      return {
        available: false,
        types: [],
        deviceName: 'Unknown',
        supportedFeatures: [],
      };
    }
  }
  return BiometricAuth.getCapabilityInfo();
}

/**
 * Register credential. On native, this is a no-op (device already has biometrics);
 * we only need to verify. On web, registers WebAuthn credential.
 */
export async function registerCredential(
  identityId: string,
  username: string
): Promise<{ id: string } | null> {
  if (isNative()) {
    // On native, just verify identity works - no WebAuthn registration
    const result = await authenticate({ identityId, reason: 'Confirm biometric setup' });
    return result.success ? { id: `native_${identityId}` } : null;
  }
  const cred = await BiometricAuth.registerCredential(identityId, username);
  return cred ? { id: cred.id } : null;
}

/**
 * Check if identity has biometric credentials (for unlock UI).
 * On native, we use isAvailable(); on web, we check stored credentials.
 */
export async function hasCredentialsForIdentity(identityId: string): Promise<boolean> {
  if (isNative()) {
    return isAvailable();
  }
  const creds = await BiometricAuth.getCredentials(identityId);
  return creds.length > 0;
}
