import type { AuthSession } from '../../types/aggregator';
import type { AuthSession as CryptoAuthSession } from '../../types/crypto';
import type { FeedCategory } from '../../types/aggregator';
import GoogleDriveIconUrl from '../../assets/icons/google-drive-logo.png?url';

export const GOOGLE_DRIVE_ICON_URL = GoogleDriveIconUrl;
export const DRIVE_ACCOUNTS_STORAGE_KEY = 'pn_google_drive_accounts';
export const METADATA_SYNC_MIN_INTERVAL_MS = 90_000;
export const INDEXER_CACHE_TTL_MS = 5 * 60 * 1000;
/** Progress UI poll while POST /storage/initialize is in flight (not a completion wait). */
export const DRIVE_INIT_POLL_INTERVAL_MS = 5_000;
export const DRIVE_INIT_REBUILD_COOLDOWN_MS = 30_000;

export type DriveSetupProgress = {
  phase: string;
  stepLabel: string;
  percent: number;
  updatedAt?: number;
};

export const isDesktopShell =
  typeof window !== 'undefined' && Boolean(window.parNoirDesktop);

export type DesktopUnlockPayload = {
  pnName: string;
  publicKey: string;
  authToken: string;
  pnIdentifier?: string;
};

export type DesktopLockPayload = {
  pnName?: string;
  publicKey?: string;
  pnIdentifier?: string;
};

export interface DriveAccountState {
  backendId: string;
  keyPrefix: string;
  // SECURITY: email removed - sensitive data should not be stored in localStorage
}

export type StoredDriveCredential = {
  backendId: string;
  keyPrefix: string;
  accessToken: string;
  refreshToken?: string | null;
  email?: string | null;
  connectedAt?: string;
  updatedAt?: string;
  /** Epoch ms when the access token expires (optional). */
  expiresAt?: number | null;
};

export interface FileStorageAggregatorProps {
  authenticatedUser?: AuthSession | CryptoAuthSession | any | null;
  apiToken?: string | null;
  /** Mint or refresh par Noir OAuth token for the active unlocked pN before owner API calls. */
  ensureOwnerApiToken?: () => Promise<string | null>;
  hideSecureFolderSection?: boolean;
  deviceGate?: {
    canDriveRead: boolean;
    canDriveUpload: boolean;
    canProfileWrite: boolean;
    blockedMessage: string;
  };
  /** Case A/B cloud persist (matches CloudReconnectHost). */
  hasKeyedDevices?: boolean;
  isKeyedSession?: boolean;
}

export type EditFormState = {
  name: string;
  description: string;
  tags: string;
  genre: string;
  category: FeedCategory | '';
  locationName: string;
  locationAddress: string;
  license: string;
};

export const EMPTY_EDIT_FORM: EditFormState = {
  name: '',
  description: '',
  tags: '',
  genre: '',
  category: '',
  locationName: '',
  locationAddress: '',
  license: 'all-rights-reserved',
};
