/**
 * One-shot restore of Google Drive connections from legacy localStorage state.
 *
 * Also scrubs email addresses that older builds wrote into localStorage keys and
 * account entries. Tokens are only ever read back from IntegrationCredentialManager
 * (encrypted); plaintext localStorage tokens are never loaded.
 */
import React, { useEffect } from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { IntegrationCredentialManager } from '../../../utils/integrationCredentialManager';
import {
  DRIVE_ACCOUNTS_STORAGE_KEY,
  type DriveAccountState,
} from '../FileStorageAggregatorTypes';
import type { UseDriveStorageCredentialsResult } from './useDriveStorageCredentials';

export interface UseLegacyDriveRestoreParams {
  aggregatorService: FileAggregatorService | null;
  authenticatedUser: any;
  resolveIdentifiersForEmail: UseDriveStorageCredentialsResult['resolveIdentifiersForEmail'];
  upsertDriveAccount: UseDriveStorageCredentialsResult['upsertDriveAccount'];
  loadFiles: () => Promise<void>;
  loadStorageQuota: () => Promise<void>;
}

export function useLegacyDriveRestore({
  aggregatorService,
  authenticatedUser,
  resolveIdentifiersForEmail,
  upsertDriveAccount,
  loadFiles,
  loadStorageQuota,
}: UseLegacyDriveRestoreParams) {
  const hasInitializedLegacyRef = React.useRef<boolean>(false);

  // Initialize and restore connections (legacy localStorage fallback)
  useEffect(() => {
    if (!aggregatorService || hasInitializedLegacyRef.current) {
      return;
    }

    hasInitializedLegacyRef.current = true;

    const init = async () => {
      try {
        await aggregatorService.ensureInitialized();
      } catch (initError) {
        console.warn('⚠️ [init] Unable to initialize aggregator service:', initError);
        return;
      }

      // SECURITY: Immediately clean up any email data from localStorage
      try {
        // Clean up email from accounts array
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            let hasEmail = false;
            const cleaned = parsed.map((entry: any) => {
              if (entry && entry.email) {
                hasEmail = true;
                const { email, ...rest } = entry;
                return rest;
              }
              return entry;
            });
            
            if (hasEmail) {
              localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(cleaned));
              console.log('[Security] Removed email from pn_google_drive_accounts on component load');
            }
          }
        }

        // SECURITY: Clean up localStorage keys that contain email patterns
        // These are keys like "google_drive_bymjmazzei-gmail-com-87d29d6d_*"
        const allKeys = Object.keys(localStorage);
        const emailPattern = /[a-z0-9]+-gmail-com-[a-z0-9]+|@[a-z0-9]+\.[a-z]+/i;
        let cleanedKeys = 0;
        
        for (const key of allKeys) {
          // Check if key contains email pattern and is Google Drive related
          if (key.includes('google_drive') && emailPattern.test(key)) {
            try {
              // Only remove credential-related keys, keep folder cache and other non-sensitive data
              if (key.includes('_token') || key.includes('_email') || key.includes('_refresh')) {
                localStorage.removeItem(key);
                cleanedKeys++;
                console.log(`[Security] Removed localStorage key containing email pattern`);
              }
            } catch (e) {
              console.warn(`[Security] Failed to remove key ${key}:`, e);
            }
          }
        }
        
        if (cleanedKeys > 0) {
          console.log(`[Security] Cleaned ${cleanedKeys} localStorage keys containing email patterns`);
        }
      } catch (cleanupError) {
        console.warn('⚠️ [init] Failed to clean email from drive accounts', cleanupError);
      }

      let storedAccounts: DriveAccountState[] = [];
      try {
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Filter out any entries that still have email (defensive)
            storedAccounts = parsed
              .filter((entry) => entry && entry.backendId && entry.keyPrefix && !entry.email)
              .map((entry: any) => ({
                backendId: entry.backendId,
                keyPrefix: entry.keyPrefix
                // Explicitly exclude email
              }));
          }
        }
      } catch (parseError) {
        console.warn('⚠️ [init] Failed to parse stored drive accounts', parseError);
      }

      if (storedAccounts.length === 0) {
        // SECURITY: Do not load plaintext tokens from localStorage
        // Legacy tokens should be migrated via IntegrationCredentialManager
        // For now, skip legacy token loading to prevent exposure
        // const legacyToken = localStorage.getItem('google_drive_token'); // REMOVED - security risk
        // if (legacyToken) {
        //   const legacyEmail = localStorage.getItem('google_drive_email'); // REMOVED - security risk
        //   const legacyRefresh = localStorage.getItem('google_drive_refresh_token'); // REMOVED - security risk
        //   ...
        // }
        
        // Instead, try to load from encrypted storage if user is authenticated
        if (authenticatedUser?.id) {
          try {
            const credentials = await IntegrationCredentialManager.getCredentials(
              'google_drive',
              authenticatedUser.id
            );
            if (credentials?.email && credentials.accessToken) {
              const identifiers = resolveIdentifiersForEmail(credentials.email);
          await upsertDriveAccount({
            backendId: identifiers.backendId,
            keyPrefix: identifiers.keyPrefix,
                token: credentials.accessToken,
                refreshToken: credentials.refreshToken ?? null,
                email: credentials.email
          });
            }
          } catch (error) {
            console.warn('[FileStorageAggregator] Failed to load encrypted credentials:', error);
          }
        }
      } else {
        for (const account of storedAccounts) {
          // SECURITY: Do not load tokens from plaintext localStorage
          // Load from encrypted storage if user is authenticated
          let token: string | null = null;
          let refresh: string | null = null;
          
          if (authenticatedUser?.id) {
            try {
              const credentials = await IntegrationCredentialManager.getCredentials(
                account.backendId,
                authenticatedUser.id
              );
              if (credentials) {
                token = credentials.accessToken ?? null;
                refresh = credentials.refreshToken || null;
              }
            } catch (error) {
              console.warn('[FileStorageAggregator] Failed to load encrypted credentials:', error);
            }
          }
          
          // Legacy fallback removed - security risk
          // const token = localStorage.getItem(`${account.keyPrefix}_token`); // REMOVED
          // const refresh = localStorage.getItem(`${account.keyPrefix}_refresh_token`); // REMOVED

          if (!token) {
            continue;
          }

          // SECURITY: Do not pass email - it's sensitive and should be in encrypted storage only
          await upsertDriveAccount({
            backendId: account.backendId,
            keyPrefix: account.keyPrefix,
            token,
            refreshToken: refresh,
            // email removed - should be retrieved from encrypted storage if needed
          });
        }
      }

      try {
        await loadFiles();
        await loadStorageQuota();
      } catch (loadError) {
        console.warn('⚠️ [init] Failed to load files during initialization', loadError);
      }
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aggregatorService]);
}
