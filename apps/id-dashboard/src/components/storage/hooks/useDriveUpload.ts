/**
 * Encrypted upload path for FileStorageAggregator.
 *
 * Resolves the pN identity required for encryption, encrypts the file, generates
 * the share token up front (so making the file public later never has to
 * re-derive it), then uploads into the identity-scoped "par Noir" Drive folder.
 *
 * The pN identifier must come from VolumeIdGenerator only — a fallback identifier
 * would write into a different folder than every other client.
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { FileAggregatorService } from '../../../services/aggregator/FileAggregatorService';
import type { EncryptionService } from '../../../services/aggregator/EncryptionService';
import { AuthSession, EncryptedFilePackage, ShareToken } from '../../../types/aggregator';
import { type DriveAccountState } from '../FileStorageAggregatorTypes';

export interface UseDriveUploadParams {
  authenticatedUser: any;
  resolvedAuth: { publicKey: string; authToken?: string } | null;
  setResolvedAuth: React.Dispatch<React.SetStateAction<{ publicKey: string; authToken?: string } | null>>;
  aggregatorService: FileAggregatorService | null;
  encryptionService: EncryptionService | null;
  driveAccounts: DriveAccountState[];
  activeBackendId: string | null;
  portableCloudAccounts: Array<{ provider: string; accountId: string; displayName?: string; isSocialCloud?: boolean }>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  checkDeviceCapability: (cap: 'drive.read' | 'drive.upload' | 'profile.write') => boolean;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
  makeShareTokenCacheKey: (backendId: string, backendFileId: string) => string;
  /** Shared refs owned by FileStorageAggregator. */
  shareTokenCache: React.MutableRefObject<Map<string, ShareToken>>;
  pnIdentifierRef: React.MutableRefObject<string | null>;
  loadFiles: () => Promise<void>;
}

export function useDriveUpload({
  authenticatedUser,
  resolvedAuth,
  setResolvedAuth,
  aggregatorService,
  encryptionService,
  driveAccounts,
  activeBackendId,
  portableCloudAccounts,
  setError,
  setIsLoading,
  checkDeviceCapability,
  getPasscodeFromSecureStorage,
  makeShareTokenCacheKey,
  shareTokenCache,
  pnIdentifierRef,
  loadFiles,
}: UseDriveUploadParams) {
  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!checkDeviceCapability('drive.upload')) {
      event.target.value = '';
      return;
    }

    console.log('📤 [Upload] Starting upload...', { fileName: file.name, fileSize: file.size });

    const targetBackendIdAttr = event.target.dataset.backendId;
    const overrideBackendId = targetBackendIdAttr && typeof targetBackendIdAttr === 'string' ? targetBackendIdAttr : null;

    // Resolve auth credentials - try multiple sources
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
      console.log('✅ [Upload] Using credentials and resolvedAuth');
    }

    // Try 2: Extract from authenticatedUser prop and credentials
    if (!pnName || !publicKey) {
      if (authenticatedUser && credentials) {
        pnName = credentials.pnName;
        publicKey = authenticatedUser.publicKey ||
          (authenticatedUser.id && authenticatedUser.id.startsWith('did:key:') ? authenticatedUser.id : authenticatedUser.id) || null;
        passcodeToUse = credentials.passcode || null;
        console.log('✅ [Upload] Using authenticatedUser prop and credentials:', { pnName: !!pnName, publicKey: !!publicKey });
      }
    }

    // Try 3: Load from storage
    if (!pnName || !publicKey) {
      console.log('📤 [Upload] Loading from storage...');
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
          console.log('✅ [Upload] Loaded from storage:', { pnName: !!pnName, publicKey: !!publicKey });
        }
      } catch (err) {
        console.error('❌ [Upload] Storage load failed:', err);
      }
    }

    // Final check
    if (!pnName || !publicKey) {
      console.error('❌ [Upload] Could not resolve auth from any source');
      setError('Please unlock your pN first to encrypt files');
      return;
    }

    // Verify we have the stable pN identity (id + publicKey) required for encryption
    // The id (DID) is stable and doesn't change between sessions
    if (!authenticatedUser?.id || !publicKey) {
      console.error('❌ [Upload] Missing stable identity (id or publicKey)');
      setError('Please unlock your pN first. The pN identity is required to encrypt files.');
      return;
    }

    // Update resolvedAuth state for future use (only public data)
    if (!resolvedAuth || resolvedAuth.publicKey !== publicKey) {
      let sessionPasscode: string | null = passcodeToUse;
      if (!sessionPasscode) {
        try {
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          sessionPasscode = getPasscodeFromSecureStorage(sessionId);
        } catch (e) {
          sessionPasscode = null;
        }
      }
      // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      if (sessionId && pnName && sessionPasscode) {
        SecureCredentialManager.setCredentials(sessionId, pnName, sessionPasscode);
      }

      // SECURITY: Only store public data in resolvedAuth (no secrets)
      setResolvedAuth({
        publicKey: publicKey!,
      });
    } else {
      // Ensure credentials are stored if they exist
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      if (!credentials && passcodeToUse && pnName) {
        // Store credentials if we have them but they're not in SecureCredentialManager
        if (sessionId) {
          SecureCredentialManager.setCredentials(sessionId, pnName, passcodeToUse);
        }
      }
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('📤 [Upload] Proceeding with upload', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser?.id });

      // Create session object for encryption using stable pN identity
      // We use id (DID) + publicKey for encryption, which are stable across sessions
      const session: AuthSession = {
        id: authenticatedUser.id,
        publicKey: publicKey!,
        accessToken: authenticatedUser.accessToken, // Keep for other uses, but not for encryption
        nickname: authenticatedUser?.nickname
      };

      // Encrypt file using stable pN identity (no passcode needed)
      if (!encryptionService) {
        setError('Encryption service not available');
        return;
      }

      console.log('🔐 [Upload] Starting encryption...', {
        hasId: !!session.id,
        idPreview: session.id?.substring(0, 20) + '...',
        hasPublicKey: !!session.publicKey,
        publicKeyPreview: session.publicKey?.substring(0, 20) + '...',
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });

      let encryptedBlob: Blob;
      let packageData: EncryptedFilePackage;
      let shareToken: ShareToken | undefined = undefined; // Generate during upload
      try {
        const result = await encryptionService.encryptFileForUpload(
          file,
          session
        );
        encryptedBlob = result.encryptedBlob;
        packageData = result.packageData;
        console.log('✅ [Upload] Encryption successful');

        // Generate share token now (during upload) so it's ready for public sharing
        // This avoids having to regenerate it later and prevents "Maximum call stack" errors
        // IMPORTANT: Generate token BEFORE upload so we can cache it with the file ID
        console.log('🔑 [Upload] Generating share token for future public sharing...');
        try {
          shareToken = await encryptionService.generateShareToken(
            packageData,
            session
          );
          console.log('✅ [Upload] Share token generated successfully');
        } catch (tokenError: any) {
          console.error('❌ [Upload] Share token generation failed:', {
            error: tokenError?.message || tokenError,
            errorName: tokenError?.name,
            stack: tokenError?.stack
          });
          // Don't fail the upload if token generation fails - user can try making it public later
          shareToken = undefined;
        }
      } catch (encryptError: any) {
        console.error('❌ [Upload] Encryption failed:', {
          error: encryptError?.message || encryptError,
          errorName: encryptError?.name,
          stack: encryptError?.stack
        });
        setError(`Failed to encrypt file: ${encryptError?.message || 'Unknown error'}. Please make sure you are unlocked.`);
        return;
      }

      if (!aggregatorService) {
        throw new Error('Storage service not available');
      }

      const portableBackendId = portableCloudAccounts[0]
        ? `${portableCloudAccounts[0].provider}::${portableCloudAccounts[0].accountId}`
        : null;
      const targetBackendId =
        overrideBackendId || activeBackendId || driveAccounts[0]?.backendId || portableBackendId;
      if (!targetBackendId) {
        throw new Error('No storage account connected');
      }

      const backend = aggregatorService.getBackend(targetBackendId);
      if (!backend || !backend.isConnected()) {
        throw new Error(`${targetBackendId} is not connected`);
      }

      // Get or create pN-specific folder using stable identifier
      // Use VolumeIdGenerator for consistency across all implementations (desktop, web, etc.)
      // Format: pn-{12-char-hex-hash} from pnName:passcode:publicKey
      let pnIdentifier: string;
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;

        // SECURITY: Get pnName from credentials (secrets), not from resolvedAuth or authenticatedUser
        const pnName = credentials?.pnName || null;

        if (pnName && credentials?.passcode && publicKey) {
          // Use VolumeIdGenerator for consistent identifier (same as desktop app)
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName,
            passcode: credentials.passcode,
            publicKey
          });
          console.log(`✅ [Upload] Generated pN identifier (VolumeIdGenerator): ${(pnIdentifier || '').substring(0, 8)}...`);
          console.log(`📁 [Upload] Will use folder: "par Noir - ${(pnIdentifier || '').substring(0, 8)}..."`);

          // Also log the fallback identifier for comparison
          if (pnIdentifierRef.current) {
            // pnIdentifierRef.current already includes 'pn-' prefix, don't add it again
            const fallbackId = pnIdentifierRef.current.startsWith('pn-') ? pnIdentifierRef.current : `pn-${pnIdentifierRef.current}`;
            console.log(`ℹ️ [Upload] Fallback identifier (did:publicKey): ${(fallbackId || '').substring(0, 8)}...`);
            if (fallbackId !== pnIdentifier) {
              console.warn(`⚠️ [Upload] Identifier mismatch! VolumeIdGenerator: ${(pnIdentifier || '').substring(0, 8)}..., Fallback: ${(fallbackId || '').substring(0, 8)}...`);
              console.warn(`⚠️ [Upload] Using VolumeIdGenerator identifier (${(pnIdentifier || '').substring(0, 8)}...) - this is the CORRECT one`);
            }
          }
        } else {
            // STANDARDIZED: Only use VolumeIdGenerator - no fallbacks
            // If credentials aren't available, we cannot upload (identifier required)
            throw new Error('Cannot generate pN identifier: credentials (pnName, passcode, publicKey) required. Please ensure you are fully authenticated.');
        }
      } catch (err) {
        // STANDARDIZED: No fallbacks - fail if identifier cannot be generated
        console.error('❌ [Upload] Failed to generate standardized pN identifier:', err);
        throw new Error(`Cannot upload file: pN identifier generation failed. ${err instanceof Error ? err.message : 'Unknown error'}`);
      }

      const folderId = await backend.getOrCreateFolder('par Noir', pnIdentifier);
      console.log(`📁 [Upload] Uploading to folder ID: ${folderId.substring(0, 12)}...`);

        // Upload encrypted file
        const encryptedFileName = `${packageData.metadata.originalName}.encrypted`;
        // Use File constructor with explicit reference to avoid minification issues
        const FileConstructor = globalThis.File || (typeof window !== 'undefined' ? window.File : File);
      const uploadedFile = await aggregatorService.uploadToBackend(
        targetBackendId,
          new FileConstructor([encryptedBlob], encryptedFileName, { type: 'application/json' }),
          folderId,
          {
            fileName: encryptedFileName,
            pnIdentifier,
          }
        );

        // Store share token in cache if generated (keyed by backend file ID for easy lookup)
        // Use uploadedFile.id as the cache key - this should match file.backendFileId when we look it up
        const cacheId = uploadedFile.id || uploadedFile.backendFileId;
        if (shareToken && cacheId) {
          const cacheKey = makeShareTokenCacheKey(targetBackendId, cacheId);
          shareTokenCache.current.set(cacheKey, shareToken);
          console.log('💾 [Upload] Share token cached for file:', cacheKey);
        } else if (!shareToken) {
          console.warn('⚠️ [Upload] No share token to cache - file was uploaded but token generation failed');
        } else {
          console.warn('⚠️ [Upload] No file ID available for caching share token');
        }

      // Refresh file list - IMPORTANT: Force reload with the same pN identifier used for upload
      console.log(`🔄 [Upload] Reloading files for pN ${pnIdentifier?.substring(0, 8)}...`);
      await loadFiles();
      console.log('✅ [Upload] File uploaded successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      console.error('❌ [Upload] Upload failed:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      // Reset file input
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  return { handleUpload };
}

export type UseDriveUploadResult = ReturnType<typeof useDriveUpload>;
