import { DRIVE_ACCOUNTS_STORAGE_KEY, type DriveAccountState } from './FileStorageAggregatorTypes';

export function persistDriveAccounts(accounts: DriveAccountState[]) {
  try {
    // SECURITY: Do not store email in accounts array - it's sensitive data
    // Only store backendId and keyPrefix (non-sensitive identifiers)
    const sanitizedAccounts = accounts.map(account => ({
      backendId: account.backendId,
      keyPrefix: account.keyPrefix,
      // email removed - security risk
    }));
    localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(sanitizedAccounts));
  } catch (storageError) {
    console.warn('⚠️ [DriveAccounts] Unable to persist drive accounts', storageError);
  }
}

export function normalizeVisibility(value: unknown): 'public' | 'private' | 'friends' {
  if (value === 'public') return 'public';
  if (value === 'friends') return 'friends';
  return 'private';
}

export function driveAccountTokens(account: Record<string, unknown> | null | undefined): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (!account || typeof account !== 'object') {
    return { accessToken: null, refreshToken: null };
  }
  const access =
    (typeof account.accessToken === 'string' && account.accessToken) ||
    (typeof account.access_token === 'string' && account.access_token) ||
    null;
  const refresh =
    (typeof account.refreshToken === 'string' && account.refreshToken) ||
    (typeof account.refresh_token === 'string' && account.refresh_token) ||
    null;
  return { accessToken: access, refreshToken: refresh };
}

