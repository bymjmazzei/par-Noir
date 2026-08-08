/**
 * Drive layout initialization state and helpers for FileStorageAggregator.
 *
 * Owns the server-side `/storage/initialize` lifecycle: the shared in-flight guards,
 * the setup-progress state shown while the layout is being built, and soft-skip
 * when the API has no Google secrets *and* no forwarded token. With
 * `googleAccessToken` (device custody), initialize is required and failures surface.
 *
 * POST /storage/initialize awaits the full server init before responding. Progress
 * polling is UI-only while that POST is in flight — never continue polling `/status`
 * after the POST settles (that previously burned hundreds of calls looking for
 * `inFlight` that the server already cleared in `finally`).
 */
import React, { useState } from 'react';
import { ownerFetch, ownerGet } from '../../../services/ownerApiService';
import { sleep } from '../../../utils/helpers';
import type { DriveSetupProgress } from '../FileStorageAggregatorTypes';

/** Progress UI poll while POST /storage/initialize is in flight (not a completion wait). */
const DRIVE_INIT_POLL_INTERVAL_MS = 5_000;

export interface UseDriveLayoutInitParams {
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export function useDriveLayoutInit({ setError }: UseDriveLayoutInitParams) {
  const [driveSetupProgress, setDriveSetupProgress] = useState<DriveSetupProgress | null>(null);
  const driveSetupProgressRef = React.useRef<DriveSetupProgress | null>(null);

  const clearDriveSetupProgress = React.useCallback(() => {
    driveSetupProgressRef.current = null;
    setDriveSetupProgress(null);
  }, []);

  const showDriveSetupProgress =
    driveSetupProgress != null &&
    driveSetupProgress.phase !== 'complete' &&
    driveSetupProgress.phase !== 'failed';

  /** Shared guard for POST /storage/initialize from persist, rebuild, and loadFiles. */
  const driveLayoutInitInFlightRef = React.useRef<Set<string>>(new Set());
  /** pnIds where server initialize soft-failed (no secrets / custody) — never retry this session. */
  const serverDriveInitUnsupportedRef = React.useRef<Set<string>>(new Set());
  /** Skip redundant rebuild for this long after a successful connect init. */
  const driveLayoutInitJustCompletedRef = React.useRef<Map<string, number>>(new Map());

  React.useEffect(() => {
    driveSetupProgressRef.current = driveSetupProgress;
  }, [driveSetupProgress]);

  const postDriveInitializeWithRetry = React.useCallback(
    async (
      pnId: string,
      accessToken: string,
      options?: {
        onProgress?: (progress: DriveSetupProgress) => void;
        maxAttempts?: number;
        /** Ephemeral Google token for device custody (X-PN-Cloud-Access-Token). */
        googleAccessToken?: string;
      }
    ): Promise<boolean> => {
      const normalized = pnId.startsWith('pn-') ? pnId : `pn-${pnId}`;
      const maxAttempts = options?.maxAttempts ?? 3;
      const onProgress = options?.onProgress;
      const googleAccessToken = options?.googleAccessToken?.trim() || '';

      // Custody with a forwarded Google token can recover from a prior soft-skip this session.
      if (googleAccessToken) {
        serverDriveInitUnsupportedRef.current.delete(normalized);
      }

      if (serverDriveInitUnsupportedRef.current.has(normalized)) {
        console.log('⏭️ [Storage] Server Drive init unsupported this session; using client discovery');
        return false;
      }
      if (driveLayoutInitInFlightRef.current.has(normalized)) {
        console.log('⏭️ [Storage] Drive layout init already in flight');
        return false;
      }
      driveLayoutInitInFlightRef.current.add(normalized);

      const applyProgress = (progress: DriveSetupProgress) => {
        onProgress?.(progress);
        setDriveSetupProgress(progress);
      };

      const pollInitStatus = async (): Promise<DriveSetupProgress | null> => {
        const statusRes = await ownerGet(
          accessToken,
          `/api/storage/initialize/${encodeURIComponent(normalized)}/status`,
          { pnIdentifier: normalized }
        );
        if (!statusRes.ok) {
          return null;
        }
        const statusData = (await statusRes.json()) as {
          progress?: DriveSetupProgress | null;
        };
        return statusData.progress ?? null;
      };

      const waitForOwnerIndexReady = async (): Promise<boolean> => {
        const { markOwnerIndexUnavailable, clearOwnerIndexUnavailable } = await import(
          '../../../services/storage/ownerIndexAvailability'
        );
        for (let attempt = 0; attempt < 4; attempt++) {
          const idxRes = await ownerGet(
            accessToken,
            `/api/storage/owner-index/${encodeURIComponent(normalized)}`,
            { pnIdentifier: normalized }
          );
          if (idxRes.ok) {
            clearOwnerIndexUnavailable(normalized);
            const { clearMetadataSheetsUnavailable } = await import(
              '../../../services/storage/metadataSheetsAvailability'
            );
            clearMetadataSheetsUnavailable(normalized);
            return true;
          }
          // Under device custody the index often cannot be served — do not retry 403/409.
          if (idxRes.status === 403 || idxRes.status === 409) {
            markOwnerIndexUnavailable(normalized);
            return false;
          }
          if (attempt < 3) {
            await sleep(1000 * (attempt + 1));
          }
        }
        return false;
      };

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      const stopPolling = () => {
        if (pollTimer != null) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };

      const pollProgressTick = async () => {
        try {
          const progress = await pollInitStatus();
          if (
            progress &&
            progress.phase !== 'complete' &&
            progress.phase !== 'failed'
          ) {
            applyProgress(progress);
          }
        } catch {
          /* non-blocking */
        }
      };

      let lastError: Error | null = null;
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          applyProgress({
            phase: 'starting',
            stepLabel: 'Preparing your par Noir storage…',
            percent: 0,
          });

          // Progress UI only — stop as soon as POST settles. Do not dual-poll or
          // keep hitting /status after the server clears inFlight in finally.
          void pollProgressTick();
          pollTimer = setInterval(() => {
            void pollProgressTick();
          }, DRIVE_INIT_POLL_INTERVAL_MS);

          let initRes: Response;
          try {
            initRes = await ownerFetch(
              accessToken,
              'POST',
              `/api/storage/initialize/${encodeURIComponent(normalized)}`,
              undefined,
              {
                pnIdentifier: normalized,
                ...(googleAccessToken
                  ? { extraHeaders: { 'X-PN-Cloud-Access-Token': googleAccessToken } }
                  : {})
              }
            );
          } catch (err) {
            stopPolling();
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt >= maxAttempts) break;
            await sleep(2000 * attempt);
            continue;
          } finally {
            stopPolling();
          }

          if (!initRes.ok) {
            const initErr = await initRes.text().catch(() => 'Unknown error');
            // Soft-skip only when we have no Google token to forward (legacy / no secrets on API).
            // With a forwarded token, 400/403/404 are real failures that block device keying.
            if (
              !googleAccessToken &&
              (initRes.status === 400 || initRes.status === 403 || initRes.status === 404)
            ) {
              serverDriveInitUnsupportedRef.current.add(normalized);
              console.warn(
                `⏭️ [Storage] Skipping server Drive init (${initRes.status}); client-side discovery will be used`
              );
              clearDriveSetupProgress();
              return false;
            }
            lastError = new Error(
              `Drive layout init failed (${initRes.status}): ${initErr.slice(0, 200)}`
            );
            (lastError as { status?: number }).status = initRes.status;
            // Only retry transient Google/API pressure.
            if (initRes.status !== 503 && initRes.status !== 429) {
              break;
            }
            if (attempt >= maxAttempts) break;
            await sleep(2000 * attempt);
            continue;
          }

          // POST already awaited full init. One short owner-index confirm — no /status loop.
          applyProgress({
            phase: 'finishing',
            stepLabel: 'Confirming storage index…',
            percent: 95,
          });
          await waitForOwnerIndexReady();

          driveLayoutInitJustCompletedRef.current.set(normalized, Date.now());
          clearDriveSetupProgress();
          const { clearOwnerIndexUnavailable } = await import(
            '../../../services/storage/ownerIndexAvailability'
          );
          const {
            isMetadataSheetsUnavailable,
            clearMetadataSheetsUnavailable,
          } = await import('../../../services/storage/metadataSheetsAvailability');
          const wasSheetsBlocked = isMetadataSheetsUnavailable(normalized);
          clearOwnerIndexUnavailable(normalized);
          clearMetadataSheetsUnavailable(normalized);
          if (wasSheetsBlocked) {
            try {
              const { publishCloudDriveReady } = await import('@par-noir/device-cloud-credentials');
              const { API_ENDPOINT } = await import('../../../config/api');
              await publishCloudDriveReady({
                authToken: accessToken,
                pnIdentifier: normalized,
                apiEndpoint: API_ENDPOINT
              });
            } catch {
              /* non-DOM */
            }
          }
          console.log('✅ [StorageCredentials] Drive layout built on server');
          return true;
        }

        console.warn('⚠️ [StorageCredentials] Drive layout build failed after retries:', lastError);
        setError('Drive setup failed. Please try disconnecting and reconnecting Google Drive.');
        clearDriveSetupProgress();
        return false;
      } finally {
        stopPolling();
        driveLayoutInitInFlightRef.current.delete(normalized);
      }
    },
    [clearDriveSetupProgress, setError]
  );

  const requestDriveLayoutRebuild = React.useCallback(async (pnId: string): Promise<boolean> => {
    // Under DEVICE_CLOUD_CUSTODY the API strips Google OAuth secrets, so
    // POST /storage/initialize returns 400. Layout rebuild must happen client-side
    // via GoogleDriveMetadataService — never kick off the server setup UI from here.
    if (!pnId.startsWith('pn-')) return false;
    console.debug(
      'ℹ️ [Storage] Server Drive layout rebuild disabled; client discovery handles incomplete indexes'
    );
    return false;
  }, []);

  return {
    driveSetupProgress,
    setDriveSetupProgress,
    driveSetupProgressRef,
    clearDriveSetupProgress,
    showDriveSetupProgress,
    driveLayoutInitInFlightRef,
    serverDriveInitUnsupportedRef,
    driveLayoutInitJustCompletedRef,
    postDriveInitializeWithRetry,
    requestDriveLayoutRebuild,
  };
}

export type UseDriveLayoutInitResult = ReturnType<typeof useDriveLayoutInit>;
