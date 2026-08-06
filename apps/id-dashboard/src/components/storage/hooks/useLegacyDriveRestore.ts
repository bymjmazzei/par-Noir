/**
 * One-shot scrub of legacy localStorage Drive account state.
 * Does NOT restore tokens from IntegrationCredentialManager — shared sealed/session
 * store (hydrateStorageCredentialsFromAPI) is the only SoT for live Google tokens.
 */
import React, { useEffect } from 'react';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import {
  DRIVE_ACCOUNTS_STORAGE_KEY,
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
}: UseLegacyDriveRestoreParams) {
  const hasInitializedLegacyRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (!aggregatorService || hasInitializedLegacyRef.current) {
      return;
    }

    hasInitializedLegacyRef.current = true;

    const scrub = async () => {
      try {
        await aggregatorService.ensureInitialized();
      } catch {
        return;
      }

      try {
        const raw = localStorage.getItem(DRIVE_ACCOUNTS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            let hasEmail = false;
            const cleaned = parsed.map((entry: Record<string, unknown>) => {
              if (entry && entry.email) {
                hasEmail = true;
                const { email: _email, ...rest } = entry;
                return rest;
              }
              return entry;
            });
            if (hasEmail) {
              localStorage.setItem(DRIVE_ACCOUNTS_STORAGE_KEY, JSON.stringify(cleaned));
            }
          }
        }

        const allKeys = Object.keys(localStorage);
        const emailPattern = /[a-z0-9]+-gmail-com-[a-z0-9]+|@[a-z0-9]+\.[a-z]+/i;
        for (const key of allKeys) {
          if (key.includes('google_drive') && emailPattern.test(key)) {
            if (key.includes('_token') || key.includes('_email') || key.includes('_refresh')) {
              localStorage.removeItem(key);
            }
          }
        }
      } catch {
        /* scrub best-effort */
      }
    };

    void scrub();
  }, [aggregatorService]);
}
