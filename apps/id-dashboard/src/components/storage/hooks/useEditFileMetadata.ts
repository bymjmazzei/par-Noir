/**
 * Edit-metadata flow for a single file in FileStorageAggregator.
 *
 * Opening the editor seeds the form from the cached metadata; saving writes to
 * the par Noir API first (source of truth) and then mirrors the change into the
 * Drive companion metadata plus the owner/public indexes. The Drive mirror is
 * best-effort — a failure there is logged but does not fail the save.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { CompanionMetadata } from '../../../services/storage/GoogleDriveMetadataService';
import { ownerFetch } from '../../../services/ownerApiService';
import { AggregatedFile, PublicMetadata, FeedCategory } from '../../../types/aggregator';
import { EMPTY_EDIT_FORM, type EditFormState } from '../FileStorageAggregatorTypes';

export interface UseEditFileMetadataParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  editingFile: AggregatedFile | null;
  setEditingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
}

export function useEditFileMetadata({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  fileMetadataMap,
  setFileMetadataMap,
  editingFile,
  setEditingFile,
  editForm,
  setEditForm,
  setError,
  setIsLoading,
  requireDeviceCapability,
  resolveOwnerApiToken,
  loadFilesRef,
}: UseEditFileMetadataParams) {
  const handleEditMetadata = (file: AggregatedFile) => {
    const metadata = fileMetadataMap.get(file.id);

    // Extract location data if present
    const location = (metadata as any)?.locationCreated || (metadata as any)?.schema?.locationCreated;
    const locationName = location?.name || '';
    const locationAddress = location?.address ?
      `${location.address.addressLocality || ''}${location.address.addressRegion ? ', ' + location.address.addressRegion : ''}${location.address.addressCountry ? ', ' + location.address.addressCountry : ''}`.trim() : '';

    // Extract genre (can be array or string)
    const genre = (metadata as any)?.genre || (metadata as any)?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');

    // Extract category (prefer feedCategories, fallback to category)
    const feedCategories = (metadata as any)?.feedCategories || [];
    const category = feedCategories.length > 0 ? feedCategories[0] : ((metadata as any)?.category || '');

    // Extract license (can be object with name or string)
    const license = (metadata as any)?.license || (metadata as any)?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '') || 'all-rights-reserved';

    setEditForm({
      name: metadata?.name || file.encrypted ? file.originalName || file.name.replace('.encrypted', '') : file.name,
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: category as FeedCategory | '',
      locationName: locationName,
      locationAddress: locationAddress,
      license: licenseString
    });
    setEditingFile(file);
  };

  const handleSaveMetadata = async () => {
    if (!editingFile) return;

    try {
      requireDeviceCapability('drive.upload');
      setIsLoading(true);
      setError(null);

      // Parse tags from comma-separated string
      const tags = editForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Parse genre from comma-separated string
      const genre = editForm.genre
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);

      // Extract subjects from description, tags, and keywords
      const { extractSubjects } = await import('../../../utils/subjectExtractor');
      const subjects = extractSubjects(
        editForm.description,
        tags,
        tags // keywords same as tags
      );

      // Validate required category
      if (!editForm.category) {
        setError('Category is required');
        setIsLoading(false);
        return;
      }

      // Build location object if provided (without lat/lng)
      let locationCreated = undefined;
      if (editForm.locationName || editForm.locationAddress) {
        locationCreated = {
          '@type': 'Place',
          ...(editForm.locationName && { name: editForm.locationName }),
          ...(editForm.locationAddress && {
            address: {
              '@type': 'PostalAddress',
              addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
              addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
              addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
            }
          })
        };
      }

      // Update via API endpoint
      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }
      const metaPath = `/api/aggregator/metadata-index/${editingFile.id}`;
      const response = await ownerFetch(accessToken, 'PUT', metaPath, {
          name: editForm.name,
          description: editForm.description,
          keywords: tags,
          tags: tags,
          genre: genre.length > 0 ? genre : undefined,
          feedCategories: editForm.category ? [editForm.category as FeedCategory] : undefined,
          category: editForm.category || undefined,
          locationCreated: locationCreated,
          license: editForm.license || undefined,
          subjects: subjects.length > 0 ? subjects : undefined
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update metadata: ${errorText}`);
      }

      const updatedMetadata = await response.json();

      // Also update Google Drive metadata file if we have access
      const backend = aggregatorService?.getBackend(editingFile.backend);
      // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (backend && backend.isConnected() && credentials?.pnName) {
        try {
          const { GoogleDriveMetadataService } = await import('../../../services/storage/GoogleDriveMetadataService');
          const token = (backend as any).token || localStorage.getItem('google_drive_token');

          if (token) {
            const publicKey = resolvedAuth?.publicKey;
            if (!publicKey) {
              throw new Error('Public identity key is required to update metadata');
            }
            // Generate stable pN identifier using VolumeIdGenerator for consistency
            let pnIdentifier: string | undefined;
            try {
              const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
              const sessionId = authenticatedUser?.id;
              const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;

              // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth (public)
              if (credentials?.pnName && credentials?.passcode) {
                pnIdentifier = await VolumeIdGenerator.generateVolumeId({
                  pnName: credentials.pnName,
                  passcode: credentials.passcode,
                  publicKey
                });
              }
            } catch (volumeIdError) {
              console.warn('⚠️ [UpdateMetadata] Failed to generate volume ID:', volumeIdError);
            }

            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            if (!pnIdentifier) {
              console.warn('⚠️ [UpdateMetadata] Cannot generate standardized pN identifier - credentials required');
              console.warn('⚠️ [UpdateMetadata] Metadata update skipped - pN identifier required');
              return;
            }

            // Get current metadata from fileMetadataMap or construct from file
            let currentMetadata = fileMetadataMap.get(editingFile.id);

            // If no metadata exists, create a basic structure
            if (!currentMetadata) {
              currentMetadata = {
                fileId: editingFile.id,
                backend: editingFile.backend,
                backendFileId: editingFile.backendFileId,
                name: editForm.name,
                description: editForm.description,
                keywords: tags,
                tags: tags,
                uploadDate: new Date().toISOString(),
                fileType: editingFile.mimeType?.split('/')[0] || 'other',
                isPublic: false,
                creator: {
                  '@type': 'Person',
                  '@id': publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                  identifier: {
                    '@type': 'PropertyValue',
                    name: 'DID',
                    value: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`
                  }
                }
              } as PublicMetadata;
            }

            // Parse genre for companion metadata
            const genre = editForm.genre
              .split(',')
              .map(g => g.trim())
              .filter(g => g.length > 0);

            // Build location object for companion metadata (without lat/lng)
            let locationCreated = undefined;
            if (editForm.locationName || editForm.locationAddress) {
              locationCreated = {
                '@type': 'Place',
                ...(editForm.locationName && { name: editForm.locationName }),
                ...(editForm.locationAddress && {
                  address: {
                    '@type': 'PostalAddress',
                    addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
                    addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
                    addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
                  }
                })
              };
            }

            // Preserve existing schema metadata (static/auto-extracted fields)
            const existingSchema = (currentMetadata as any)?.schema || {};

            // Update companion metadata file
            const companionMetadata: CompanionMetadata = {
              fileId: editingFile.id,
              googleDriveFileId: editingFile.backendFileId,
              fileName: editingFile.name,
              originalName: editForm.name,
              mimeType: editingFile.mimeType || 'application/octet-stream',
              size: parseInt(editingFile.size?.toString() || '0', 10),
              visibility: currentMetadata.isPublic ? 'public' : 'private',
              uploadedAt: currentMetadata.uploadDate || new Date().toISOString(),
              owner: {
                did: publicKey.startsWith('did:') ? publicKey : `did:key:${publicKey}`,
                identifier: pnIdentifier
              },
              tags: tags,
              description: editForm.description,
              metadata: {},
              publicToken: currentMetadata.publicToken,
              thumbnail:
                typeof currentMetadata.thumbnail === 'string'
                  ? currentMetadata.thumbnail
                  : currentMetadata.thumbnail?.['@id'],
              inReplyTo: currentMetadata.inReplyTo,
              repostOf: currentMetadata.repostOf,
              isPartOf: currentMetadata.isPartOf,
              indexingPermissions: currentMetadata.indexingPermissions,
              schema: {
                ...existingSchema, // Preserve auto-extracted technical metadata (width, height, duration, etc.)
                ...(genre.length > 0 && { genre }),
                ...(editForm.category && { category: editForm.category }),
                ...(editForm.category && { feedCategories: [editForm.category as FeedCategory] }),
                ...(locationCreated && { locationCreated }),
                ...(editForm.license && { license: editForm.license }),
                // Preserve existing NSFW value (managed via Share Settings)
                ...(currentMetadata.isNSFW !== undefined && { isNSFW: currentMetadata.isNSFW })
              },
              engagement: currentMetadata.engagement || {
                views: 0,
                likes: 0,
                comments: 0,
                shares: 0,
                lastUpdated: currentMetadata.uploadDate || new Date().toISOString()
              }
            };

            // Always update companion metadata (even for private files)
              await GoogleDriveMetadataService.createCompanionMetadataFile(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Always update owner index (contains ALL files)
              await GoogleDriveMetadataService.updateOwnerFileIndex(
                token,
                pnIdentifier,
                companionMetadata
              );

              // Update public index if public
              if (currentMetadata.isPublic) {
                await GoogleDriveMetadataService.updatePublicFileIndex(
                  token,
                  pnIdentifier,
                  companionMetadata
                );
              }
          }
        } catch (driveError) {
          console.warn('Failed to update Google Drive metadata (non-critical):', driveError);
          // Don't fail the whole operation if Google Drive update fails
        }
      }

      // Update local state
      if (updatedMetadata.metadata) {
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          const metadata = updatedMetadata.metadata;
          next.set(editingFile.id, metadata);
          if (editingFile.backendFileId && editingFile.backendFileId !== editingFile.id) {
            next.set(editingFile.backendFileId, metadata);
          }
          if (metadata.fileId && metadata.fileId !== editingFile.id) {
            next.set(metadata.fileId, metadata);
          }
          if (metadata.backendFileId && metadata.backendFileId !== editingFile.id) {
            next.set(metadata.backendFileId, metadata);
          }
          return next;
        });
      }

      // Refresh files to show updated metadata
      if (loadFilesRef.current) {
        loadFilesRef.current();
      }

      setEditingFile(null);
      setEditForm({ ...EMPTY_EDIT_FORM });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update metadata');
      console.error('Error updating metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleEditMetadata,
    handleSaveMetadata,
  };
}

export type UseEditFileMetadataResult = ReturnType<typeof useEditFileMetadata>;
