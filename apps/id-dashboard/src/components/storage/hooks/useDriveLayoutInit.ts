/**
 * Drive layout initialization state and helpers for FileStorageAggregator.
 *
 * Owns the server-side `/storage/initialize` lifecycle: the shared in-flight guards,
 * the setup-progress state shown while the layout is being built, and soft-skip
 * when the API has no Google secrets *and* no forwarded token. With
 * `googleAccessToken` (device custody), initialize is required and failures surface.
 *
 * POST /api/storage/initialize returns 202 and runs Drive work in the background
 * (proxies time out long sync awaits). Client polls GET .../status infrequently
 * (~15s) with the forwarded cloud token until complete/failed.
 */
import React, { useState } from 'react';
import { ownerFetch, ownerGet } from '../../../services/ownerApiService';
import { sleep } from '../../../utils/helpers';
import type { DriveSetupProgress } from '../FileStorageAggregatorTypes';
import {
  beginDriveLayoutInit,
  endDriveLayoutInit,
} from '../../../services/storage/driveLayoutInitGate';

/** Infrequent enough to avoid RecoveryDrive soft-warn storms under custody. */
const STATUS_POLL_MS = 20_000;
/** Drive layout builds can take several minutes after a wipe. */
const STATUS_MAX_WAIT_MS = 10 * 60_000;

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
      const cloudInit = googleAccessToken
        ? { extraHeaders: { 'X-PN-Cloud-Access-Token': googleAccessToken } }
        : {};

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
      beginDriveLayoutInit();

      const applyProgress = (progress: DriveSetupProgress) => {
        onProgress?.(progress);
        setDriveSetupProgress(progress);
      };

      const waitForOwnerIndexReady = async (): Promise<boolean> => {
        const { markOwnerIndexUnavailable, clearOwnerIndexUnavailable } = await import(
          '../../../services/storage/ownerIndexAvailability'
        );
        for (let attempt = 0; attempt < 4; attempt++) {
          const idxRes = await ownerGet(
            accessToken,
            `/api/storage/owner-index/${encodeURIComponent(normalized)}`,
            { pnIdentifier: normalized, ...cloudInit }
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

      const pollInitStatusUntilSettled = async (): Promise<'complete' | 'failed' | 'timeout'> => {
        const deadline = Date.now() + STATUS_MAX_WAIT_MS;
        while (Date.now() < deadline) {
          try {
            const statusRes = await ownerGet(
              accessToken,
              `/api/storage/initialize/${encodeURIComponent(normalized)}/status`,
              { pnIdentifier: normalized, ...cloudInit }
            );
            if (statusRes.ok) {
              const body = (await statusRes.json()) as {
                inFlight?: boolean;
                complete?: boolean;
                failed?: boolean;
                progress?: DriveSetupProgress | null;
              };
              if (body.progress && typeof body.progress.percent === 'number') {
                applyProgress({
                  phase: body.progress.phase || 'folders',
                  stepLabel:
                    body.progress.stepLabel ||
                    'Building Drive folders and sheets (this can take a few minutes)…',
                  percent: body.progress.percent,
                  updatedAt: body.progress.updatedAt,
                });
              } else if (body.inFlight) {
                applyProgress({
                  phase: 'folders',
                  stepLabel: 'Building Drive folders and sheets (this can take a few minutes)…',
                  percent: Math.max(driveSetupProgressRef.current?.percent ?? 15, 15),
                });
              }
              if (body.complete || body.progress?.phase === 'complete') {
                return 'complete';
              }
              if (body.failed || body.progress?.phase === 'failed') {
                return 'failed';
              }
            }
          } catch {
            /* transient network — keep polling */
          }
          await sleep(STATUS_POLL_MS);
        }
        return 'timeout';
      };

      const finishSuccessfulInit = async (): Promise<true> => {
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
              apiEndpoint: API_ENDPOINT,
            });
          } catch {
            /* non-DOM */
          }
        }
        console.log('✅ [StorageCredentials] Drive layout built on server');
        try {
          const { reconcileOwnerInventory } = await import(
            '../../../services/ownerInventoryReconcile'
          );
          const result = await reconcileOwnerInventory({
            pnIdentifier: normalized,
            googleAccessToken: options?.googleAccessToken,
          });
          if (result.removed > 0 || result.checked > 0) {
            console.log('🧹 [Storage] Owner inventory reconcile', result);
          }
        } catch (reconcileErr) {
          console.warn('⚠️ [Storage] Owner inventory reconcile skipped', reconcileErr);
        }
        return true;
      };

      let lastError: Error | null = null;
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          applyProgress({
            phase: 'starting',
            stepLabel: 'Preparing your par Noir storage…',
            percent: 5,
          });

          let initRes: Response | null = null;
          let postNetworkFailed = false;
          try {
            initRes = await ownerFetch(
              accessToken,
              'POST',
              `/api/storage/initialize/${encodeURIComponent(normalized)}`,
              undefined,
              {
                pnIdentifier: normalized,
                ...cloudInit,
              }
            );
          } catch (err) {
            postNetworkFailed = true;
            lastError = err instanceof Error ? err : new Error(String(err));
          }

          // Proxy 502 / CORS (no ACAO on error) — init may still be running server-side.
          const proxyTimedOut =
            postNetworkFailed ||
            (initRes != null && (initRes.status === 502 || initRes.status === 504));

          if (proxyTimedOut) {
            applyProgress({
              phase: 'folders',
              stepLabel: 'Building Drive folders and sheets (this can take a few minutes)…',
              percent: 20,
            });
            const settled = await pollInitStatusUntilSettled();
            if (settled === 'complete') {
              return finishSuccessfulInit();
            }
            if (settled === 'failed') {
              lastError = new Error('Drive layout init failed on server');
              if (attempt >= maxAttempts) break;
              await sleep(2000 * attempt);
              continue;
            }
            lastError = new Error('Drive layout init timed out waiting for status');
            break;
          }

          if (!initRes) {
            if (attempt >= maxAttempts) break;
            await sleep(2000 * attempt);
            continue;
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

          // Legacy sync API returned folder ids on 200; new API returns 202 + background work.
          let body: {
            initInProgress?: boolean;
            metadataFolderId?: string;
            pnFolderId?: string;
          } = {};
          try {
            body = (await initRes.json()) as typeof body;
          } catch {
            /* empty body */
          }

          const syncDone =
            initRes.status === 200 &&
            !body.initInProgress &&
            Boolean(body.metadataFolderId || body.pnFolderId);
          if (syncDone) {
            return finishSuccessfulInit();
          }

          applyProgress({
            phase: 'folders',
            stepLabel: 'Building Drive folders and sheets (this can take a few minutes)…',
            percent: 15,
          });
          const settled = await pollInitStatusUntilSettled();
          if (settled === 'complete') {
            return finishSuccessfulInit();
          }
          if (settled === 'failed') {
            lastError = new Error('Drive layout init failed on server');
            if (attempt >= maxAttempts) break;
            await sleep(2000 * attempt);
            continue;
          }
          lastError = new Error('Drive layout init timed out waiting for status');
          break;
        }

        console.warn('⚠️ [StorageCredentials] Drive layout build failed after retries:', lastError);
        setError('Drive setup failed. Please try disconnecting and reconnecting Google Drive.');
        clearDriveSetupProgress();
        return false;
      } finally {
        driveLayoutInitInFlightRef.current.delete(normalized);
        endDriveLayoutInit();
        try {
          const { clearOwnedAssetsUnavailable } = await import(
            '../../../services/storage/ownedAssetsAvailability'
          );
          clearOwnedAssetsUnavailable(normalized);
        } catch {
          /* non-DOM */
        }
        // Re-probe owned-assets / delegations now that layout (or attempt) settled.
        try {
          const { PN_CLOUD_CREDENTIALS_READY_EVENT } = await import('@par-noir/oauth-ui');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(PN_CLOUD_CREDENTIALS_READY_EVENT));
          }
        } catch {
          /* non-DOM */
        }
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
