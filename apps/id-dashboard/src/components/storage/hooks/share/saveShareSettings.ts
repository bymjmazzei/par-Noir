/**
 * Commit the share modal's pending state for one file.
 *
 * Applies, in order: the public/private flip (delegated to
 * `togglePublicVisibility`), the NSFW flag, and the per-indexer permissions.
 * NSFW and indexer permissions only apply to public content.
 *
 * Extracted verbatim from `useShareAndIndexing` so the hook can stay focused on
 * modal state; every dependency it touches is passed in explicitly.
 */
import React from 'react';
import type { IndexingPermissions, ThirdPartyIndexer } from '../../../../types/indexers';
import { AggregatedFile, PublicMetadata } from '../../../../types/aggregator';
import { resolveOwnerApiToken } from '../../../../services/ownerApiToken';
import { getOwnerApiPnIdentifier, ownerFetch } from '../../../../services/ownerApiService';

export interface SaveShareSettingsDeps {
  authenticatedUser: any;
  sharingFile: AggregatedFile | null;
  shareVisibility: 'public' | 'private';
  shareNSFW: boolean;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  indexerToggles: Record<string, boolean>;
  thirdPartyIndexers: ThirdPartyIndexer[];
  indexingPermissionsState: IndexingPermissions | null;
  setIndexingPermissionsState: React.Dispatch<React.SetStateAction<IndexingPermissions | null>>;
  setIndexerError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsSavingShare: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  togglePublic: (file: AggregatedFile) => Promise<void>;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  refreshMetadataInBackground: (
    file: AggregatedFile,
    options?: { forceSync?: boolean; refreshIndexers?: boolean }
  ) => Promise<void> | void;
  closeShareSettings: () => void;
}

export async function saveShareSettings({
  authenticatedUser,
  sharingFile,
  shareVisibility,
  shareNSFW,
  fileMetadataMap,
  setFileMetadataMap,
  indexerToggles,
  thirdPartyIndexers,
  indexingPermissionsState,
  setIndexingPermissionsState,
  setIndexerError,
  setIsSavingShare,
  setError,
  requireDeviceCapability,
  togglePublic,
  loadFileMetadata,
  refreshMetadataInBackground,
  closeShareSettings,
}: SaveShareSettingsDeps): Promise<void> {
  if (!sharingFile) {
    return;
  }

  try {
    requireDeviceCapability('drive.upload');
    setIsSavingShare(true);
    const fileForRefresh = sharingFile;
    const existingMetadata =
      fileMetadataMap.get(sharingFile.id) ||
      (sharingFile.backendFileId ? fileMetadataMap.get(sharingFile.backendFileId) : undefined);
    const targetFileId = existingMetadata?.fileId || sharingFile.id;

    const isCurrentlyPublic = existingMetadata?.isPublic || false;
    const makePublic = shareVisibility === 'public';

    const blockedIds = Object.entries(indexerToggles)
      .filter(([, enabled]) => !enabled)
      .map(([id]) => id);
    const enabledIds = Object.entries(indexerToggles)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);

    let nextPermissions: IndexingPermissions | null = null;
    if (thirdPartyIndexers.length > 0) {
      if (blockedIds.length === 0) {
        nextPermissions = {
          mode: 'all',
          blocked: [],
          allowed: enabledIds,
          updatedAt: new Date().toISOString()
        };
      } else if (blockedIds.length === thirdPartyIndexers.length) {
        nextPermissions = {
          mode: 'none',
          blocked: [...blockedIds],
          allowed: [],
          updatedAt: new Date().toISOString()
        };
      } else {
        nextPermissions = {
          mode: 'all',
          blocked: [...blockedIds],
          allowed: enabledIds,
          updatedAt: new Date().toISOString()
        };
      }
    } else if (indexingPermissionsState) {
      nextPermissions = {
        ...indexingPermissionsState,
        updatedAt: new Date().toISOString()
      };
    }

    if (makePublic !== isCurrentlyPublic) {
      await togglePublic(sharingFile);
      await loadFileMetadata([sharingFile]);
    }

    // Update NSFW flag if it changed (only for public content)
    if (makePublic) {
      const currentNSFW = existingMetadata?.isNSFW === true;
      if (shareNSFW !== currentNSFW) {
        try {
          const ownerToken = resolveOwnerApiToken();
          if (!ownerToken) {
            console.error('❌ [ShareSettings] Failed to update NSFW flag: API session not ready');
          } else {
            const response = await ownerFetch(
              ownerToken,
              'PUT',
              `/api/aggregator/metadata-index/${encodeURIComponent(targetFileId)}`,
              {
                isNSFW: shareNSFW,
                isPublic: true
              },
              { pnIdentifier: getOwnerApiPnIdentifier() ?? undefined }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ [ShareSettings] Failed to update NSFW flag:', errorText);
            } else {
              setFileMetadataMap((prev) => {
                const next = new Map(prev);
                const targets = new Set<string>();
                targets.add(sharingFile.id);
                targets.add(targetFileId);
                if (sharingFile.backendFileId) {
                  targets.add(sharingFile.backendFileId);
                }
                if (existingMetadata?.fileId) {
                  targets.add(existingMetadata.fileId);
                }

                targets.forEach((key) => {
                  const current = next.get(key);
                  if (current) {
                    next.set(key, {
                      ...current,
                      isNSFW: shareNSFW
                    });
                  }
                });

                return next;
              });
            }
          }
        } catch (nsfwError) {
          console.error('❌ [ShareSettings] Failed to update NSFW flag:', nsfwError);
          // Don't throw - this is non-critical
        }
      }
    }

    if (makePublic && nextPermissions) {
      try {
        // Retry on 429 (rate limit) errors with exponential backoff
        const { retry: retryHelper } = await import('../../../../utils/helpers');

        const response = await retryHelper(
          async () => {
            const ownerToken = resolveOwnerApiToken();
            if (!ownerToken) {
              throw new Error('par Noir API session not ready');
            }
            const res = await ownerFetch(
              ownerToken,
              'PUT',
              `/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
              { indexingPermissions: nextPermissions },
              { pnIdentifier: getOwnerApiPnIdentifier() ?? undefined }
            );

            // If 429, throw to trigger retry
            if (res.status === 429) {
              const retryAfter = res.headers.get('Retry-After');
              const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
              const error = new Error(`Rate limited (429). ${delay ? `Retry after ${delay}ms` : 'Retrying...'}`);
              (error as any).status = 429;
              (error as any).retryAfter = delay;
              throw error;
            }

            if (!res.ok) {
              const errorText = await res.text().catch(() => res.statusText);
              throw new Error(errorText || `Failed to update index visibility (${res.status})`);
            }

            return res;
          },
          3, // maxAttempts
          2000 // baseDelay (2 seconds)
        );
      } catch (apiError) {
        const message = apiError instanceof Error ? apiError.message : 'Failed to update index visibility';
        setIndexerError(message);
        console.error('❌ [Sharing] Failed to update third-party visibility via API:', apiError);
        throw apiError;
      }
    }

    if (nextPermissions) {
      setFileMetadataMap((prev) => {
        const next = new Map(prev);
        const targets = new Set<string>();
        targets.add(sharingFile.id);
        targets.add(targetFileId);
        if (sharingFile.backendFileId) {
          targets.add(sharingFile.backendFileId);
        }
        if (existingMetadata?.fileId) {
          targets.add(existingMetadata.fileId);
        }

        targets.forEach((key) => {
          const current = next.get(key);
          if (current) {
            next.set(key, {
              ...current,
              indexingPermissions: nextPermissions
            });
          }
        });

        return next;
      });
      setIndexingPermissionsState(nextPermissions);
    }

    void refreshMetadataInBackground(fileForRefresh, {
      forceSync: true,
      refreshIndexers: true,
    });

    closeShareSettings();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update sharing settings';
    setError(message);
    console.error('❌ [Sharing] Failed to update sharing settings:', error);
  } finally {
    setIsSavingShare(false);
  }
}
