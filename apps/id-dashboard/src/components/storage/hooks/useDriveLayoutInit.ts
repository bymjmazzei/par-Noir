/**
 * Drive layout initialization state and helpers for FileStorageAggregator.
 *
 * Owns the server-side `/storage/initialize` lifecycle: the shared in-flight guards,
 * the setup-progress state shown while the layout is being built, and soft-skip
 * when the API has no Google secrets *and* no forwarded token. With
 * `googleAccessToken` (device custody), initialize is required and failures surface.
 */
import React, { useState } from 'react';
import { ownerFetch, ownerGet } from '../../../services/ownerApiService';
import { retry } from '../../../utils/helpers';
import {
  DRIVE_INIT_POLL_TIMEOUT_MS,
  DRIVE_INIT_POLL_INTERVAL_MS,
  type DriveSetupProgress,
} from '../FileStorageAggregatorTypes';

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

      const pollInitStatus = async (): Promise<{
        inFlight: boolean;
        progress: DriveSetupProgress | null;
      }> => {
        const statusRes = await ownerGet(
          accessToken,
          `/api/storage/initialize/${encodeURIComponent(normalized)}/status`
        );
        if (!statusRes.ok) {
          return { inFlight: false, progress: null };
        }
        const statusData = (await statusRes.json()) as {
          inFlight?: boolean;
          progress?: DriveSetupProgress | null;
        };
        return {
          inFlight: Boolean(statusData.inFlight),
          progress: statusData.progress ?? null,
        };
      };

      const waitForOwnerIndexReady = async (): Promise<boolean> => {
        const { markOwnerIndexUnavailable, clearOwnerIndexUnavailable } = await import(
          '../../../services/storage/ownerIndexAvailability'
        );
        for (let attempt = 0; attempt < 6; attempt++) {
          const idxRes = await ownerGet(
            accessToken,
            `/api/storage/owner-index/${encodeURIComponent(normalized)}`
          );
          if (idxRes.ok) {
            clearOwnerIndexUnavailable(normalized);
            return true;
          }
          // Under device custody the index often cannot be served — do not retry 403/409.
          if (idxRes.status === 403 || idxRes.status === 409) {
            markOwnerIndexUnavailable(normalized);
            return false;
          }
          if (attempt < 5) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
        return false;
      };

      const waitForServerInit = async (postStartedAt: number): Promise<boolean> => {
        const deadline = Date.now() + DRIVE_INIT_POLL_TIMEOUT_MS;
        let sawInFlight = false;

        while (Date.now() < deadline) {
          try {
            const { inFlight, progress } = await pollInitStatus();
            if (inFlight) sawInFlight = true;

            if (
              progress &&
              progress.phase !== 'complete' &&
              progress.phase !== 'failed'
            ) {
              applyProgress(progress);
            }
            if (progress?.phase === 'failed') {
              return false;
            }

            if (sawInFlight && !inFlight) {
              return waitForOwnerIndexReady();
            }

            if (!sawInFlight && Date.now() - postStartedAt > 90_000) {
              console.warn('⚠️ [Storage] Drive init status never reported in-flight');
              return false;
            }
          } catch {
            /* keep polling */
          }
          await new Promise((r) => setTimeout(r, DRIVE_INIT_POLL_INTERVAL_MS));
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
          const { progress } = await pollInitStatus();
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

      try {
        const result = await retry(async () => {
          const postStartedAt = Date.now();
          applyProgress({
            phase: 'starting',
            stepLabel: 'Preparing your par Noir storage…',
            percent: 0,
          });

          void pollProgressTick();
          pollTimer = setInterval(() => {
            void pollProgressTick();
          }, DRIVE_INIT_POLL_INTERVAL_MS);

          // Await POST first so custody soft-skips (400) exit immediately instead of
          // polling for minutes while loadFiles is blocked / setup UI spins.
          let initRes: Response;
          try {
            initRes = await ownerFetch(
              accessToken,
              'POST',
              `/api/storage/initialize/${encodeURIComponent(normalized)}`,
              undefined,
              googleAccessToken
                ? { extraHeaders: { 'X-PN-Cloud-Access-Token': googleAccessToken } }
                : undefined
            );
          } catch (err) {
            throw err instanceof Error ? err : new Error(String(err));
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
              stopPolling();
              clearDriveSetupProgress();
              return true;
            }
            const err = new Error(
              `Drive layout init failed (${initRes.status}): ${initErr.slice(0, 200)}`
            );
            (err as { status?: number }).status = initRes.status;
            throw err;
          }

          const serverOk = await waitForServerInit(postStartedAt);
          if (serverOk) {
            return true;
          }
          console.warn('⚠️ [Storage] Drive init wait finished without server confirmation');
          return true;
        }, maxAttempts, 2000);

        if (!result) {
          return false;
        }

        driveLayoutInitJustCompletedRef.current.set(normalized, Date.now());
        clearDriveSetupProgress();
        const { clearOwnerIndexUnavailable } = await import(
          '../../../services/storage/ownerIndexAvailability'
        );
        clearOwnerIndexUnavailable(normalized);
        console.log('✅ [StorageCredentials] Drive layout built on server');
        return true;
      } catch (initError) {
        console.warn('⚠️ [StorageCredentials] Drive layout build failed after retries:', initError);
        setError('Drive setup failed. Please try disconnecting and reconnecting Google Drive.');
        clearDriveSetupProgress();
        return false;
      } finally {
        stopPolling();
        driveLayoutInitInFlightRef.current.delete(normalized);
      }
    },
    [clearDriveSetupProgress]
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
