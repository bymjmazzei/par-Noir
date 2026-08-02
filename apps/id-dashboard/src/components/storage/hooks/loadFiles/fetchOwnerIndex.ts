/**
 * Owner-index resolution for a single storage backend.
 *
 * Device custody note: an owner-index 409 means the server-side Drive index is
 * incomplete (expected when OAuth secrets live on the device, not the API). That
 * path must fall through to client-side Drive discovery — never POST
 * /storage/initialize, which 400s without server-held tokens and loops setup UI.
 */
import React from 'react';
import { ownerGet } from '../../../../services/ownerApiService';

export interface FetchOwnerIndexParams {
  backendId: string;
  accessToken: string | null | undefined;
  currentPnIdentifier: string | undefined;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  retryBackends: Set<string>;
  rateLimitedBackendsRef: React.MutableRefObject<Set<string>>;
  ownerIndexWarningLoggedRef: React.MutableRefObject<Set<string>>;
}

export interface FetchOwnerIndexResult {
  ownerIndex: any;
  ownerIndexFromApi: boolean;
  /** Auth-related discovery failure: the caller must skip this backend for the current pass. */
  skipBackend: boolean;
}

export async function fetchOwnerIndex({
  backendId,
  accessToken,
  currentPnIdentifier,
  resolveOwnerApiToken,
  retryBackends,
  rateLimitedBackendsRef,
  ownerIndexWarningLoggedRef,
}: FetchOwnerIndexParams): Promise<FetchOwnerIndexResult> {
  let ownerIndex: any = null;
  let ownerIndexFromApi = false;
  let skipClientDriveDiscovery = false;

  const ownerApiToken = currentPnIdentifier
    ? resolveOwnerApiToken(
        currentPnIdentifier.startsWith('pn-')
          ? currentPnIdentifier
          : `pn-${currentPnIdentifier}`
      )
    : resolveOwnerApiToken();
  if (!ownerIndex && currentPnIdentifier && ownerApiToken) {
    try {
      const pnId = currentPnIdentifier.startsWith('pn-')
        ? currentPnIdentifier
        : `pn-${currentPnIdentifier}`;
      // Do not block client discovery while a server init is in flight —
      // under device custody that init often cannot succeed (400), and
      // skipping discovery leaves the Storage UI empty / stuck on setup.
      const idxRes = await ownerGet(
        ownerApiToken,
        `/api/storage/owner-index/${encodeURIComponent(pnId)}`
      );
      if (idxRes.status === 403) {
        // Device policy / custody — fall through to client Drive discovery
        console.debug('ℹ️ [loadFiles] owner-index forbidden; using client Drive discovery');
      } else if (idxRes.status === 409) {
        // Server Drive index incomplete (common under device cloud custody where
        // OAuth secrets are not on the API). Do NOT POST /storage/initialize —
        // that returns 400 without server-held tokens and loops the "setup" UI.
        // Fall through to client-side folder/index discovery with the local Google token.
        console.debug(
          'ℹ️ [loadFiles] owner-index incomplete (409); using client Drive discovery instead of server rebuild'
        );
      } else if (idxRes.ok) {
        const idxData = await idxRes.json();
        const provider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
        const filteredFiles = (idxData.files || []).filter(
          (entry: any) => (entry.backend || 'google_drive') === provider
        );
        ownerIndex = { ...idxData, files: filteredFiles };
        ownerIndexFromApi = true;
        skipClientDriveDiscovery = true;
      }
    } catch {
      /* non-blocking */
    }
  }

  if (accessToken && currentPnIdentifier && !ownerIndex && !skipClientDriveDiscovery) {
    try {
      const { GoogleDriveMetadataService } = await import('../../../../services/storage/GoogleDriveMetadataService');
      const pnFolderId = await GoogleDriveMetadataService.getOrCreatePNFolder(accessToken, currentPnIdentifier);
      const metadataFolderId = await GoogleDriveMetadataService.getOrCreateMetadataFolder(accessToken, pnFolderId);
      // Try loading from content class-specific indices first, fallback to root index
      ownerIndex = await GoogleDriveMetadataService.getOwnerFileIndexFromContentClasses(
        accessToken,
        metadataFolderId,
        currentPnIdentifier,
        resolveOwnerApiToken()
      );
      console.debug('📋 [loadFiles] Owner index response', {
        backendId,
        hasIndex: !!ownerIndex,
        fileCount: ownerIndex?.files?.length || 0,
      });
    } catch (ownerIndexError) {
      const errorMessage =
        ownerIndexError instanceof Error ? ownerIndexError.message : String(ownerIndexError);
      const isAuthRelated =
        typeof errorMessage === 'string' &&
        (errorMessage.includes('Failed to search for pN folder') ||
         errorMessage.includes('Failed to search for metadata folder') ||
         errorMessage.includes('Google Drive authentication expired') ||
         errorMessage.includes('token refresh is temporarily rate limited'));

      if (isAuthRelated) {
        retryBackends.add(backendId);
        rateLimitedBackendsRef.current.add(backendId);
        console.debug('⏳ [loadFiles] Owner index request will retry after token refresh', {
          backendId,
          error: errorMessage,
        });
        return { ownerIndex, ownerIndexFromApi, skipBackend: true };
      } else if (!ownerIndexWarningLoggedRef.current.has(backendId)) {
        console.warn('⚠️ [loadFiles] Failed to read owner index (non-blocking):', {
          backendId,
          error: ownerIndexError,
        });
        ownerIndexWarningLoggedRef.current.add(backendId);
      } else {
        console.debug('ℹ️ [loadFiles] Owner index still unavailable', {
          backendId,
          error: errorMessage,
        });
      }
    }
  }

  return { ownerIndex, ownerIndexFromApi, skipBackend: false };
}
