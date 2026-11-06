/**
 * Aggregated file/quota loading for FileStorageAggregator.
 *
 * Owns loadFiles, loadStorageQuota and the token-retry scheduling that backs them.
 * Listing is the shared owner inventory (@par-noir/owner-files): device owner index,
 * a Drive scan of the canonical owner folders, and the owner catalog (Pen posts etc.).
 * Durable public-cache cleanup is Cloud SoT reconcile
 * (POST /api/storage/owner-index/:id/reconcile → OAuth-less publicContentRef probe).
 *
 * Device custody note: an owner-index 409 means the server-side Drive index is
 * incomplete (expected when OAuth secrets live on the device, not the API).
 * fetchOwnerIndex leaves the index null (one attempt only) and the inventory
 * fills via a Drive scan — never a second owner-index GET, never POST
 * /storage/initialize (which 400s without server-held tokens and loops setup UI).
 */
import React from 'react';
import {
  loadOwnerInventory,
  parseAccountKey,
  type OwnerAccount,
  type OwnerFileRow,
  type OwnerFilesTransport,
} from '@par-noir/owner-files';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import { GoogleDriveBackend } from '../../../services/storage/GoogleDriveBackend';
import { PublicMetadata } from '../../../types/aggregator';
import {
  type DriveSetupProgress,
  type FileStorageAggregatorProps,
} from '../FileStorageAggregatorTypes';
import {
  isDriveLayoutBusy,
  LOAD_FILES_TIMEOUT_MS,
  waitForDriveLayoutIdle,
} from './driveLayoutBusy';
import { useTokenRetry } from './loadFiles/useTokenRetry';

export interface UseLoadAggregatedFilesParams {
  aggregatorService: FileAggregatorService | null;
  /** Null until the canonical pN identifier is known. */
  transport: OwnerFilesTransport | null;
  activeBackendId: string | null;
  setActiveBackendId: React.Dispatch<React.SetStateAction<string | null>>;
  setRows: React.Dispatch<React.SetStateAction<OwnerFileRow[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  setStorageQuotas: React.Dispatch<React.SetStateAction<Map<string, any>>>;
  setUserEmails: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  registerPortableCloudBackends: () => Promise<void>;
  driveReadBlocked: boolean;
  deviceGate: FileStorageAggregatorProps['deviceGate'];
  /** Shared refs owned by FileStorageAggregator / useDriveLayoutInit. */
  pnIdentifierRef: React.MutableRefObject<string | null>;
  driveLayoutInitInFlightRef: React.MutableRefObject<Set<string>>;
  driveSetupProgressRef: React.MutableRefObject<DriveSetupProgress | null>;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
  loadStorageQuotaRef: React.MutableRefObject<(() => Promise<void>) | null>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
  ownerIndexRetryCountsRef: React.MutableRefObject<Map<string, number>>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  pendingRetryTimeoutRef: React.MutableRefObject<number | null>;
}

function isDriveTokenCooldown(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    (err as { code?: string } | null)?.code === 'GOOGLE_DRIVE_REFRESH_COOLDOWN' ||
    message.includes('token refresh is temporarily rate limited') ||
    message.includes('Google Drive authentication expired')
  );
}

export function useLoadAggregatedFiles({
  aggregatorService,
  transport,
  activeBackendId,
  setActiveBackendId,
  setRows,
  setError,
  setIsLoading,
  setFileMetadataMap,
  setStorageQuotas,
  setUserEmails,
  registerPortableCloudBackends,
  driveReadBlocked,
  deviceGate,
  pnIdentifierRef,
  driveLayoutInitInFlightRef,
  driveSetupProgressRef,
  loadFilesRef,
  loadStorageQuotaRef,
  ownerIndexWarningLoggedRef,
  ownerIndexRetryCountsRef,
  rateLimitedBackendsRef,
  pendingRetryTimeoutRef,
}: UseLoadAggregatedFilesParams) {
  const isLoadingFilesRef = React.useRef(false);

  const scheduleTokenRetry = useTokenRetry({
    setError,
    loadFilesRef,
    ownerIndexWarningLoggedRef,
    ownerIndexRetryCountsRef,
    rateLimitedBackendsRef,
    pendingRetryTimeoutRef,
  });

  const loadFiles = React.useCallback(async (opts?: { verifyWithDrive?: boolean }) => {
    const verifyWithDrive = !!opts?.verifyWithDrive;
    if (isLoadingFilesRef.current) {
      console.log('⏳ [loadFiles] Load already in progress, skipping');
      return;
    }
    if (
      isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
    ) {
      console.log('⏳ [loadFiles] Drive layout setup in progress, waiting before file load');
      const waitResult = await waitForDriveLayoutIdle(() =>
        isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
      );
      if (waitResult === 'timeout') {
        console.warn('⚠️ [loadFiles] Layout wait timed out; loading files anyway');
      }
      if (isLoadingFilesRef.current) {
        console.log('⏳ [loadFiles] Load already in progress after layout wait, skipping');
        return;
      }
    }
    if (driveReadBlocked) {
      setRows([]);
      setError(deviceGate?.blockedMessage ?? null);
      setIsLoading(false);
      return;
    }
    isLoadingFilesRef.current = true;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      console.warn('⚠️ [loadFiles] Timed out; clearing loading spinner');
      setIsLoading(false);
      isLoadingFilesRef.current = false;
    }, LOAD_FILES_TIMEOUT_MS);
    try {
      setIsLoading(true);
      setError(null);

      // Refresh / verify path: durable inventory reconcile before trusting owner-index.
      if (verifyWithDrive) {
        try {
          const { reconcileOwnerInventory } = await import(
            '../../../services/ownerInventoryReconcile'
          );
          const result = await reconcileOwnerInventory({
            pnIdentifier: pnIdentifierRef.current || undefined,
          });
          if (result.removed > 0 || result.errors > 0) {
            console.log('🧹 [loadFiles] Owner inventory reconcile', result);
          }
        } catch (reconcileErr) {
          console.warn('⚠️ [loadFiles] Owner inventory reconcile skipped', reconcileErr);
        }
      }

      if (!aggregatorService || !transport) {
        console.warn('⚠️ [loadFiles] Storage service or pN identity not ready');
        setRows([]);
        return;
      }

      await registerPortableCloudBackends();

      try {
        await aggregatorService.ensureInitialized();
      } catch {
        console.warn('⚠️ [loadFiles] Backend initialization skipped (Google Drive may not be connected)');
        setRows([]);
        return;
      }

      const connectedEntries = aggregatorService
        .listBackendEntries()
        .filter(({ backend }) => backend.isConnected());
      if (connectedEntries.length === 0) {
        console.log('ℹ️ [loadFiles] No connected storage backends yet; waiting for connection');
        setRows([]);
        return;
      }
      if (timedOut) return;

      if (!activeBackendId) {
        setActiveBackendId((prev) => prev || connectedEntries[0]?.id || null);
      }

      const retryBackends = new Set<string>();
      const accounts: OwnerAccount[] = [];
      for (const { id, backend } of connectedEntries) {
        if (rateLimitedBackendsRef.current.has(id)) {
          console.debug('⏳ [loadFiles] Skipping backend during refresh cooldown', { backendId: id });
          continue;
        }
        if (backend instanceof GoogleDriveBackend && !(await backend.ensureAccessToken())) {
          retryBackends.add(id);
        }
        const { provider, accountId } = parseAccountKey(id);
        accounts.push({ accountKey: id, provider, accountId, label: id });
      }

      const inventory = await loadOwnerInventory(transport, {
        accounts,
        verifyWithDrive,
        onAccountError: (account, err) => {
          if (!isDriveTokenCooldown(err)) return;
          retryBackends.add(account.accountKey);
          rateLimitedBackendsRef.current.add(account.accountKey);
        },
      });
      if (timedOut) return;

      for (const account of accounts) {
        if (!inventory.errors[account.accountKey]) ownerIndexRetryCountsRef.current.delete(account.accountKey);
      }
      setRows(inventory.rows);
      setFileMetadataMap(
        new Map(Object.entries(inventory.metadataById) as Array<[string, PublicMetadata]>)
      );

      if (retryBackends.size > 0) {
        console.debug('⏳ [loadFiles] Scheduling retry after token refresh', {
          retryBackends: Array.from(retryBackends),
        });
        scheduleTokenRetry(Array.from(retryBackends));
      }
    } catch (err) {
      // Don't set error or break unlock - just log it
      console.warn('⚠️ [loadFiles] Error (non-blocking, unlock can proceed):', err);
      setRows([]);
    } finally {
      window.clearTimeout(timeoutId);
      if (!timedOut) {
        setIsLoading(false);
        isLoadingFilesRef.current = false;
      }
    }
  }, [aggregatorService, transport, activeBackendId, scheduleTokenRetry, driveReadBlocked, deviceGate, registerPortableCloudBackends, pnIdentifierRef]);

  const loadStorageQuota = React.useCallback(async () => {
    if (!aggregatorService) {
      return;
    }

    if (isLoadingFilesRef.current) {
      // If files are currently loading, defer quota load to avoid extra pressure
      return;
    }
    if (
      isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
    ) {
      // Same gate as loadFiles — avoid Drive about/user-info spam during initialize.
      const waitResult = await waitForDriveLayoutIdle(() =>
        isDriveLayoutBusy(driveLayoutInitInFlightRef.current, driveSetupProgressRef.current)
      );
      if (waitResult === 'timeout') {
        console.warn('⚠️ [loadStorageQuota] Layout wait timed out; loading quota anyway');
      }
      if (isLoadingFilesRef.current) return;
    }
    try {
      // Ensure backends are initialized (gracefully fail if Google Drive not connected)
      await aggregatorService.ensureInitialized();

      const quotas = await aggregatorService.getAggregatedStorageQuota();
      setStorageQuotas(quotas);

      // Also load user info
      const userInfos = await aggregatorService.getAggregatedUserInfo();
      const emails = new Map<string, string>();
      userInfos.forEach((info, backendId) => {
        if (info.email) {
          emails.set(backendId, info.email);
        }
      });
      setUserEmails((prev) => {
        if (prev.size === emails.size) {
          let same = true;
          for (const [k, v] of emails) {
            if (prev.get(k) !== v) {
              same = false;
              break;
            }
          }
          if (same) return prev;
        }
        return emails;
      });
    } catch (err) {
      // Don't log as error - this is expected if Google Drive isn't connected
      console.warn('⚠️ Could not load storage quota (Google Drive may not be connected):', err);
    }
  }, [aggregatorService, driveLayoutInitInFlightRef, driveSetupProgressRef, loadStorageQuotaRef]);

  React.useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);

  React.useEffect(() => {
    loadStorageQuotaRef.current = loadStorageQuota;
  }, [loadStorageQuota]);

  return {
    loadFiles,
    loadStorageQuota,
    scheduleTokenRetry,
    isLoadingFilesRef,
  };
}

export type UseLoadAggregatedFilesResult = ReturnType<typeof useLoadAggregatedFiles>;
