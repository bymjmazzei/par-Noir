/**
 * IndexedDB storage for device Ed25519 private keys (v1 software keys).
 * Keys are scoped per pN identifier; never log or expose private key material.
 */

import { exportDevicePrivateKey, importDevicePrivateKey } from '@par-noir/device-auth';

const DB_NAME = 'pn-device-keys';
const DB_VERSION = 1;
const STORE = 'keys';

export interface StoredDeviceRegistration {
  pnIdentifier: string;
  deviceId: string;
  publicKey: string;
  privateKeyPkcs8: string;
  label: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open device key DB'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'pnIdentifier' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveDeviceRegistration(reg: StoredDeviceRegistration): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(reg);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store device key'));
  });
  db.close();
}

export async function loadDeviceRegistration(
  pnIdentifier: string
): Promise<StoredDeviceRegistration | null> {
  const db = await openDb();
  const row = await new Promise<StoredDeviceRegistration | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(pnIdentifier);
    req.onsuccess = () => resolve(req.result as StoredDeviceRegistration | undefined);
    req.onerror = () => reject(req.error ?? new Error('Failed to load device key'));
  });
  db.close();
  return row ?? null;
}

export async function loadDeviceRegistrationByDeviceId(
  deviceId: string
): Promise<StoredDeviceRegistration | null> {
  const db = await openDb();
  const row = await new Promise<StoredDeviceRegistration | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as StoredDeviceRegistration[]) ?? [];
      resolve(all.find((r) => r.deviceId === deviceId) ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error('Failed to scan device keys'));
  });
  db.close();
  return row;
}

export async function clearDeviceRegistration(pnIdentifier: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(pnIdentifier);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to clear device key'));
  });
  db.close();
}

export async function importStoredPrivateKey(reg: StoredDeviceRegistration): Promise<CryptoKey> {
  return importDevicePrivateKey(reg.privateKeyPkcs8);
}

export async function persistNewKeypair(params: {
  pnIdentifier: string;
  deviceId: string;
  publicKey: string;
  privateKey: CryptoKey;
  label?: string;
  deviceType?: StoredDeviceRegistration['deviceType'];
}): Promise<StoredDeviceRegistration> {
  const privateKeyPkcs8 = await exportDevicePrivateKey(params.privateKey);
  const reg: StoredDeviceRegistration = {
    pnIdentifier: params.pnIdentifier,
    deviceId: params.deviceId,
    publicKey: params.publicKey,
    privateKeyPkcs8,
    label: params.label || detectDeviceLabel(),
    deviceType: params.deviceType || detectDeviceType(),
  };
  await saveDeviceRegistration(reg);
  return reg;
}

function detectDeviceType(): StoredDeviceRegistration['deviceType'] {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/iphone|android|mobile/.test(ua)) return 'mobile';
  if (/mac|win|linux/.test(ua)) return 'desktop';
  return 'other';
}

function detectDeviceLabel(): string {
  const type = detectDeviceType();
  const platform = navigator.platform || 'Browser';
  return `${type.charAt(0).toUpperCase() + type.slice(1)} (${platform})`;
}
