/**
 * Per-file actions for FileStorageAggregator.
 *
 * Covers everything the user can do to an already-uploaded file. This hook owns
 * download, set-as-profile-image, and move-to-another-cloud, and composes the
 * three focused hooks that own the rest: `useEditFileMetadata`,
 * `useFilePreview`, and `useDriveFileDeletion`. The combined result is the
 * single surface FileStorageAggregator consumes.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import { ownerFetch } from '../../../services/ownerApiService';
import { AggregatedFile, AuthSession, PublicMetadata, ShareToken } from '../../../types/aggregator';
import { isImageFile } from '../FileStorageAggregatorHelpers';
import {
  type DriveAccountState,
  type EditFormState,
} from '../FileStorageAggregatorTypes';
import { useEditFileMetadata } from './useEditFileMetadata';
import { useFilePreview } from './useFilePreview';
import { useDriveFileDeletion } from './useDriveFileDeletion';

export interface UseDriveFileActionsParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  aggregatorService: FileAggregatorService | null;
  encryptionService: EncryptionService | null;
  driveAccounts: DriveAccountState[];
  activeBackendId: string | null;
  files: AggregatedFile[];
  filesByBackend: Map<string, AggregatedFile[]>;
  fileMetadataMap: Map<string, PublicMetadata>;
  setFileMetadataMap: React.Dispatch<React.SetStateAction<Map<string, PublicMetadata>>>;
  filePreviewUrls: Map<string, string>;
  setFilePreviewUrls: React.Dispatch<React.SetStateAction<Map<string, string>>>;
  loadingPreviews: Set<string>;
  setLoadingPreviews: React.Dispatch<React.SetStateAction<Set<string>>>;
  editingFile: AggregatedFile | null;
  setEditingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  editForm: EditFormState;
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>;
  setViewingFile: React.Dispatch<React.SetStateAction<AggregatedFile | null>>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIsBulkDeleteMode: React.Dispatch<React.SetStateAction<boolean>>;
  setOpenMenuFor: React.Dispatch<React.SetStateAction<string | null>>;
  actionMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  cloudPnIdentifier: string | null;
  moveDestKey: string;
  setMoveDestKey: React.Dispatch<React.SetStateAction<string>>;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  requireDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => void;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  loadFileMetadata: (filesToLoad: AggregatedFile[]) => Promise<void>;
  /** Shared refs owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  loadFilesRef: React.MutableRefObject<((opts?: { verifyWithDrive?: boolean }) => Promise<void>) | null>;
  loadFiles: (opts?: { verifyWithDrive?: boolean }) => Promise<void>;
}

export function useDriveFileActions({
  authenticatedUser,
  resolvedAuth,
  aggregatorService,
  encryptionService,
  driveAccounts,
  activeBackendId,
  files,
  filesByBackend,
  fileMetadataMap,
  setFileMetadataMap,
  filePreviewUrls,
  setFilePreviewUrls,
  loadingPreviews,
  setLoadingPreviews,
  editingFile,
  setEditingFile,
  editForm,
  setEditForm,
  setViewingFile,
  selectedFiles,
  setSelectedFiles,
  setIsBulkDeleteMode,
  setOpenMenuFor,
  actionMenuRef,
  setError,
  setSuccessMessage,
  setIsLoading,
  cloudPnIdentifier,
  moveDestKey,
  setMoveDestKey,
  checkDeviceCapability,
  requireDeviceCapability,
  resolveOwnerApiToken,
  makeShareTokenCacheKey,
  loadFileMetadata,
  shareTokenCache,
  loadFilesRef,
  loadFiles,
}: UseDriveFileActionsParams) {
  const { handleEditMetadata, handleSaveMetadata } = useEditFileMetadata({
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
  });

  const { handleViewFile, loadFilePreview } = useFilePreview({
    authenticatedUser,
    resolvedAuth,
    aggregatorService,
    encryptionService,
    activeBackendId,
    files,
    fileMetadataMap,
    setFileMetadataMap,
    filePreviewUrls,
    setFilePreviewUrls,
    loadingPreviews,
    setLoadingPreviews,
    setViewingFile,
    makeShareTokenCacheKey,
    loadFileMetadata,
    shareTokenCache,
  });

  const {
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    handleDelete,
  } = useDriveFileDeletion({
    aggregatorService,
    driveAccounts,
    filesByBackend,
    selectedFiles,
    setSelectedFiles,
    setIsBulkDeleteMode,
    setError,
    setIsLoading,
    checkDeviceCapability,
    resolveOwnerApiToken,
    loadFilesRef,
  });

  const handleDownload = async (file: AggregatedFile) => {
    if (!aggregatorService) {
      console.error('⚠️ [Download] Aggregator service unavailable');
      setError('Storage service not available. Try reconnecting your drive.');
      return;
    }

    console.log('📥 [Download] Starting download...', { fileName: file.name, fileId: file.backendFileId });

    // Resolve auth credentials - try multiple sources (same as upload)
    let pnName: string | null = null;
    let publicKey: string | null = null;
    let passcodeToUse: string | null = null;

    // SECURITY: Get credentials from SecureCredentialManager (secrets)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;

    // Try 1: Use credentials and resolvedAuth (public data)
    if (credentials?.pnName && resolvedAuth?.publicKey) {
      pnName = credentials.pnName;
      publicKey = resolvedAuth.publicKey;
      passcodeToUse = credentials.passcode || null;
      console.log('✅ [Download] Using credentials and resolvedAuth');
    }

    // Try 2: Extract from authenticatedUser prop and credentials
    if (!pnName || !publicKey) {
      if (authenticatedUser && credentials) {
        pnName = credentials.pnName;
        publicKey = authenticatedUser.publicKey ||
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        passcodeToUse = credentials.passcode || null;
        console.log('✅ [Download] Using authenticatedUser prop and credentials:', { pnName: !!pnName, publicKey: !!publicKey });
      }
    }

    // Try 3: Load from storage
    if (!pnName || !publicKey) {
      console.log('📥 [Download] Loading from storage...');
      try {
        const { SecureStorage } = await import('../../../utils/storage');
        const storage = new SecureStorage();
        await storage.init();
        const session = await storage.getCurrentSession();

        if (session) {
          // SECURITY: Get pnName from SecureCredentialManager (secrets), not from session storage
          const sessionId = session.id || (session as any)?.publicKey || null;
          const sessionCredentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
          pnName = sessionCredentials?.pnName || null;
          publicKey = (session as any).publicKey ||
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id) || null;
          console.log('✅ [Download] Loaded from storage:', { pnName: !!pnName, publicKey: !!publicKey });
        }
      } catch (err) {
        console.error('❌ [Download] Storage load failed:', err);
      }
    }

    // Final check
    if (!pnName || !publicKey) {
      console.error('❌ [Download] Could not resolve auth from any source');
      setError('Please unlock your pN first to decrypt files');
      return;
    }

    // Verify we have the stable pN identity (id + publicKey) required for decryption
    // The id (DID) is stable and doesn't change between sessions
    if (!authenticatedUser?.id || !publicKey) {
      console.error('❌ [Download] Missing stable identity (id or publicKey)');
      setError('Please unlock your pN first. The pN identity is required to decrypt files.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📥 [Download] Proceeding with download', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser?.id });

      // Download encrypted file from backend
      const encryptedBlob = await aggregatorService.downloadFromBackend(
        file.backend,
        file.backendFileId
      );

      console.log('📥 [Download] Encrypted file downloaded, size:', encryptedBlob.size);

      // Create session object for decryption using stable pN identity
      // We use id (DID) + publicKey for decryption, which are stable across sessions
      const session: AuthSession = {
        id: authenticatedUser!.id,
        publicKey: publicKey!,
        accessToken: authenticatedUser!.accessToken, // Keep for other uses, but not for decryption
        nickname: authenticatedUser?.nickname
      };

      console.log('📥 [Download] Attempting decryption with stable pN identity...', {
        sessionId: session.id?.substring(0, 20) + '...',
        hasId: !!session.id,
        hasPublicKey: !!session.publicKey
      });

      // Decrypt file using stable pN identity (id + publicKey)
      // The id (DID) is stable and doesn't change between sessions, ensuring consistent decryption
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }

      // Parse the encrypted package from the blob
      const encryptedPackageText = await encryptedBlob.text();
      const encryptedPackage = JSON.parse(encryptedPackageText);

      // Decrypt using authenticated session token - no user input needed
      console.log('🔐 [Download] Starting decryption...', {
        hasId: !!session.id,
        idPreview: session.id?.substring(0, 20) + '...',
        hasPublicKey: !!session.publicKey,
        publicKeyPreview: session.publicKey?.substring(0, 20) + '...',
        encryptedPackageKeys: Object.keys(encryptedPackage),
        hasEncrypted: !!encryptedPackage.encrypted,
        encryptedLength: encryptedPackage.encrypted?.length,
        hasIv: !!encryptedPackage.iv,
        ivLength: encryptedPackage.iv?.length,
        hasSalt: !!encryptedPackage.salt,
        saltLength: encryptedPackage.salt?.length
      });

      let decryptedBlob: Blob;
      let metadata: any;
      try {
        const result = await encryptionService.decryptFileFromDownload(
          encryptedPackage,
          session
        );
        decryptedBlob = result.decryptedBlob;
        metadata = result.metadata;
      } catch (decryptError: any) {
        console.error('❌ [Download] Decryption failed:', {
          error: decryptError?.message || decryptError,
          errorName: decryptError?.name,
          stack: decryptError?.stack
        });
        const errorMsg = decryptError?.message || 'Unknown error';
        console.error('❌ [Download] Decryption failed:', {
          error: errorMsg,
          errorDetails: decryptError,
          fileId: file.id,
          backendFileId: file.backendFileId,
          fileName: file.name,
          hasSessionId: !!session?.id,
          hasPublicKey: !!session?.publicKey,
          stack: decryptError instanceof Error ? decryptError.stack : undefined
        });
        setError(`Failed to decrypt file: ${errorMsg}. This file may have been encrypted with a different method or credentials.`);
        return;
      }

      console.log('✅ [Download] Decryption successful, downloading file...', { originalName: metadata.originalName });

      // Download decrypted file
      const url = window.URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.originalName || file.name.replace('.encrypted', '');
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log('✅ [Download] File download initiated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      console.error('❌ [Download] Download failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetProfileImage = async (file: AggregatedFile) => {
    if (!authenticatedUser?.id) {
      setError('Please unlock your pN first');
      return;
    }
    if (!checkDeviceCapability('profile.write')) return;

    // Check if file is an image
    const mimeType = file.mimeType || '';
    const fileName = file.originalName || file.name || '';
    const isImage = isImageFile(mimeType, fileName);

    if (!isImage) {
      setError('Only image files can be set as profile image');
      return;
    }

    // Get fileId from metadata if available, otherwise use file.id
    const metadata = fileMetadataMap.get(file.id) ||
                     (file.backendFileId ? fileMetadataMap.get(file.backendFileId) : undefined);
    const fileId = metadata?.fileId || file.id;

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = resolveOwnerApiToken();
      if (!accessToken) {
        throw new Error('par Noir API session not ready — unlock again and retry');
      }

      const ownerPnId = (() => {
        const pk = authenticatedUser?.publicKey || authenticatedUser?.id;
        if (!pk) return null;
        return String(pk).startsWith('pn-') ? String(pk) : `pn-${pk}`;
      })();
      if (!ownerPnId) {
        throw new Error('Missing identity identifier');
      }

      const response = await ownerFetch(accessToken, 'POST', '/api/profile/image', {
        userPnIdentifier: ownerPnId,
        fileId: fileId,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to set profile image' }));
        throw new Error(error.error || 'Failed to set profile image');
      }

      console.log('✅ [Profile Image] Profile image updated successfully');
      // Could show success message here if there's a success handler
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to set profile image';
      console.error('❌ [Profile Image] Failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setOpenMenuFor(null);
      actionMenuRef.current = null;
    }
  };

  const handleMoveToCloud = async () => {
    const ownerToken = resolveOwnerApiToken();
    if (!cloudPnIdentifier || !ownerToken || !moveDestKey) {
      setError('Select a destination cloud and unlock your identity.');
      return;
    }
    const sep = moveDestKey.indexOf('|||');
    if (sep < 0) return;
    const destProvider = moveDestKey.slice(0, sep);
    const destAccountId = moveDestKey.slice(sep + 3);
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await ownerFetch(
        ownerToken,
        'POST',
        '/api/storage/migrate/files/start',
        {
          pnIdentifier: cloudPnIdentifier,
          fileIds,
          destProvider,
          destAccountId,
          mode: 'move'
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Move failed');
      }
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      setMoveDestKey('');
      await loadFiles({ verifyWithDrive: true });
      setSuccessMessage(`Moved ${fileIds.length} file(s) to ${destProvider}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    handleEditMetadata,
    handleSaveMetadata,
    handleViewFile,
    loadFilePreview,
    handleDownload,
    handleSetProfileImage,
    handleMoveToCloud,
    handleBulkDelete,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    handleDelete,
  };
}

export type UseDriveFileActionsResult = ReturnType<typeof useDriveFileActions>;
