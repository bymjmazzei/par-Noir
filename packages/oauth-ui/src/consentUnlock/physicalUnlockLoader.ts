/**
 * Load API-hosted oauth-physical-unlock.js (USB / NFC / file decrypt helpers).
 * Same script as the legacy oauth-consent.html — real crypto, no mocks.
 */

export type PhysicalUnlockResult = {
  encryptedIdentity: {
    publicKey: string;
    encryptedData: string;
    iv: string;
    salt: string;
    [key: string]: unknown;
  };
  publicKey: string;
  did: string;
  decryptedIdentity: Record<string, unknown>;
};

export type NfcIdentityPayload = {
  boundPnBlob: string;
  uid: string;
};

export type ParNoirOAuthPhysicalApi = {
  decryptIdentityFile: (
    identityRow: Record<string, unknown>,
    pnName: string,
    passcode: string
  ) => Promise<PhysicalUnlockResult>;
  unlockBoundIdentity: (
    boundPnBlobJson: string | object,
    uid: string,
    pnName: string,
    passcode: string
  ) => Promise<PhysicalUnlockResult>;
  unlockFromUsbKeyAndPayload: (
    keyFileText: string,
    drivePasscode: string,
    payloadFileTextOrNull: string | null,
    pnName: string,
    passcode: string
  ) => Promise<PhysicalUnlockResult>;
  readNfcIdentity: () => Promise<NfcIdentityPayload>;
  hasNfc: () => boolean;
};

declare global {
  interface Window {
    ParNoirOAuthPhysical?: ParNoirOAuthPhysicalApi;
  }
}

let loadPromise: Promise<ParNoirOAuthPhysicalApi> | null = null;

/**
 * Ensure window.ParNoirOAuthPhysical is available (loads script once per page).
 */
export function loadParNoirOAuthPhysical(apiEndpoint: string): Promise<ParNoirOAuthPhysicalApi> {
  if (typeof window !== 'undefined' && window.ParNoirOAuthPhysical) {
    return Promise.resolve(window.ParNoirOAuthPhysical);
  }
  if (loadPromise) return loadPromise;

  const base = apiEndpoint.replace(/\/$/, '');
  const src = `${base}/oauth-assets/oauth-physical-unlock.js`;

  loadPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Physical unlock requires a browser'));
      return;
    }
    const existing = document.querySelector(`script[data-pn-physical-unlock="1"]`);
    if (existing && window.ParNoirOAuthPhysical) {
      resolve(window.ParNoirOAuthPhysical);
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.pnPhysicalUnlock = '1';
    script.onload = () => {
      if (!window.ParNoirOAuthPhysical) {
        loadPromise = null;
        reject(new Error('Physical unlock script failed to initialize'));
        return;
      }
      resolve(window.ParNoirOAuthPhysical);
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load physical unlock script from API'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function physicalResultToBundle(result: PhysicalUnlockResult): {
  encryptedIdentity: {
    publicKey: string;
    encryptedData: string;
    iv: string;
    salt: string;
  };
  publicKey: string;
  did: string;
  decryptedIdentity: Record<string, unknown>;
} {
  const enc = result.encryptedIdentity;
  const encryptedData = String(enc.encryptedData ?? enc.encrypted ?? '');
  const iv = String(enc.iv ?? '');
  const salt = String(enc.salt ?? '');
  if (!encryptedData || !iv || !salt) {
    throw new Error('Physical unlock returned incomplete encrypted identity');
  }
  return {
    encryptedIdentity: {
      publicKey: result.publicKey,
      encryptedData,
      iv,
      salt,
    },
    publicKey: result.publicKey,
    did: result.did,
    decryptedIdentity: result.decryptedIdentity,
  };
}
