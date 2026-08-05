/**
 * Tool permission and data-point attestation handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { IdentityCrypto, SecureCredentialManager } from '@par-noir/identity-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import { cloudSyncManager } from '../utils/cloudSync';
import { ownerFetch } from '../services/ownerApiService';
import { requireOwnerApiToken, resolveOwnerApiToken } from '../services/ownerApiToken';
import { STANDARD_DATA_POINTS, VERIFF_CAPABLE_IDS } from '../types/StandardDataPointsRegistry';
import type { GlobalPrivacySettings } from '../types/privacy';
import type { DIDInfo, SyncedDevice } from '../types/app';
import { mintDerivedAgeZkps, mintDerivedNameZkps } from '../utils/mintDerivedZkps';

export interface UseToolPrivacyHandlersParams {
  authenticatedUser: any;
  selectedDID: DIDInfo | null;
  currentDevice: SyncedDevice | null;
  generateDeviceFingerprint: () => string;

  privacySettings: GlobalPrivacySettings;
  setPrivacySettings: React.Dispatch<React.SetStateAction<GlobalPrivacySettings>>;
  setSelectedToolId: React.Dispatch<React.SetStateAction<string>>;
  setShowToolSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;

  currentDataPoint: any;
  setCurrentDataPoint: React.Dispatch<React.SetStateAction<any>>;
  setCurrentDataPointExistingData: React.Dispatch<React.SetStateAction<any>>;
  setShowDataPointInputModal: React.Dispatch<React.SetStateAction<boolean>>;
  setAttestedDataPoints: React.Dispatch<React.SetStateAction<Set<string>>>;
  verifiedDataPoints: Set<string>;
  getEncryptedIdentityForApiToken: (
    identityPublicKeyOrId: string
  ) => Promise<{ encryptedData: string; iv: string; salt: string; publicKey?: string } | null>;

  apiToken: string | null;
  ensureOwnerApiTokenForActiveUser: () => Promise<string | null>;
  /** Stable pN volume id for cloud session bootstrap */
  pnIdentifier?: string | null;

  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useToolPrivacyHandlers(params: UseToolPrivacyHandlersParams) {
  const {
    authenticatedUser,
    selectedDID,
    currentDevice,
    generateDeviceFingerprint,
    privacySettings,
    setPrivacySettings,
    setSelectedToolId,
    setShowToolSettingsModal,
    currentDataPoint,
    setCurrentDataPoint,
    setCurrentDataPointExistingData,
    setShowDataPointInputModal,
    setAttestedDataPoints,
    verifiedDataPoints,
    getEncryptedIdentityForApiToken,
    apiToken,
    ensureOwnerApiTokenForActiveUser,
    pnIdentifier,
    setError,
    setSuccessWithTimeout,
    logDebug,
    logError
  } = params;

  const resolveOwnerAuthToken = async (): Promise<string> => {
    if (apiToken) return apiToken;
    const ensured = await ensureOwnerApiTokenForActiveUser();
    if (ensured) return ensured;
    return requireOwnerApiToken();
  };

  const ensureDriveCloudSession = async (): Promise<void> => {
    const token = await resolveOwnerAuthToken();
    const sessionId = authenticatedUser?.id;
    if (!token || !sessionId) return;
    let pn = pnIdentifier || null;
    if (!pn) {
      try {
        const credentials = SecureCredentialManager.getCredentials(sessionId);
        if (credentials?.pnName && credentials?.passcode) {
          const { derivePnIdentifierForToken } = await import('../services/parNoirOAuthInline');
          pn = await derivePnIdentifierForToken(
            credentials.pnName,
            credentials.passcode,
            authenticatedUser.publicKey || sessionId
          );
        }
      } catch {
        return;
      }
    }
    if (!pn) return;
    const { ensureCloudSessionBootstrap } = await import('../contexts/CloudSessionContext');
    await ensureCloudSessionBootstrap({
      apiToken: token,
      pnIdentifier: pn,
      sessionId
    });
  };

  // Tool Settings Handlers
  const handleOpenToolSettings = (toolId: string) => {
    setSelectedToolId(toolId);
    setShowToolSettingsModal(true);
  };

  const handleToggleToolDataPoint = async (toolId: string, dataPointId: string, enabled: boolean) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    // Required data points must always be included
    const requiredDataPoints = tool.requiredDataPoints || [];
    
    // For optional data points, add/remove based on enabled flag
    // For required data points, always include them
    const newDataPoints = enabled
      ? [...new Set([...tool.dataPoints, dataPointId])] // Ensure no duplicates
      : tool.dataPoints.filter(dp => dp !== dataPointId && !requiredDataPoints.includes(dp)); // Don't remove required
    
    // Always include required data points
    const finalDataPoints = [...new Set([...newDataPoints, ...requiredDataPoints])];

    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...tool,
          dataPoints: finalDataPoints,
          requiredDataPoints: tool.requiredDataPoints || [],
          optionalDataPoints: tool.optionalDataPoints || []
        }
      }
    };
    setPrivacySettings(newSettings);

    // Persist to Google Drive via API
    try {
      const credentials = SecureCredentialManager.getCredentials(authenticatedUser?.id || '');
      if (!credentials || !authenticatedUser?.id) {
        console.warn('[App] Cannot persist permissions - credentials not available');
        return;
      }

      let authToken: string;
      try {
        authToken = await resolveOwnerAuthToken();
      } catch {
        console.warn('[App] Cannot persist permissions - owner API token not ready');
        return;
      }

      // Get pN identifier
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const pnIdentifier = await VolumeIdGenerator.generateVolumeId({
        pnName: credentials.pnName,
        passcode: credentials.passcode,
        publicKey: authenticatedUser.publicKey || ''
      });

      // Store permissions via API (will be saved to Google Drive)
      const path = `/api/users/${pnIdentifier}/third-party-permissions`;
      const response = await ownerFetch(authToken, 'PUT', path, {
        toolId,
        permission: newSettings.toolPermissions[toolId],
      }, { pnIdentifier });

      if (!response.ok) {
        console.error('Failed to persist permissions:', response.status);
      } else {
        console.log('✅ Permissions persisted to Google Drive');
      }
    } catch (error) {
      console.error('Error persisting permissions:', error);
    }
  };

  const handleSetToolDataPointRequired = (toolId: string, dataPointId: string, required: boolean) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    const currentRequired = tool.requiredDataPoints || [];
    const currentOptional = tool.optionalDataPoints || [];

    const newRequiredDataPoints = required
      ? [...currentRequired.filter(dp => dp !== dataPointId), dataPointId]
      : currentRequired.filter(dp => dp !== dataPointId);
    
    const newOptionalDataPoints = required
      ? currentOptional.filter(dp => dp !== dataPointId)
      : [...currentOptional.filter(dp => dp !== dataPointId), dataPointId];

    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...tool,
          requiredDataPoints: newRequiredDataPoints,
          optionalDataPoints: newOptionalDataPoints
        }
      }
    };
    setPrivacySettings(newSettings);
  };

  const handleDeactivateTool = (toolId: string) => {
    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...privacySettings.toolPermissions[toolId],
          status: privacySettings.toolPermissions[toolId].status === 'active' ? 'revoked' as const : 'revoked' as const
        }
      }
    };
    setPrivacySettings(newSettings);

    // Store privacy settings update in cloud database for cross-platform sync
    cloudSyncManager.initialize().then(() => {
      return cloudSyncManager.storeUpdate({
        type: 'privacy',
        identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
        publicKey: authenticatedUser?.publicKey || '',
        data: {
          action: 'update',
          toolId,
          newSettings
        },
        updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
      });
    }).then(() => {
              logDebug('Privacy settings update stored in cloud database for cross-platform sync');
    }).catch((error) => {
                logError('Failed to store privacy settings update in cloud:', error);
      // Don't fail the entire operation if cloud sync fails
    });

    setSuccessWithTimeout('Tool status updated successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  // Helper function to map data point ID to proof type for ZKP API
  const mapDataPointIdToProofType = (dataPointId: string): 'age_verification' | 'identity_verification' | 'location_verification' | 'document_verification' => {
    switch (dataPointId) {
      case 'age_attestation':
        return 'age_verification';
      case 'identity_attestation':
        return 'identity_verification';
      case 'location_verification':
        return 'location_verification';
      case 'document_verification':
        return 'document_verification';
      default:
        // Default to identity_verification for unknown data points
        return 'identity_verification';
    }
  };

  const handleRequestDataPoint = async (dataPointId: string) => {
    try {
      await ensureDriveCloudSession();
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      if (!dataPoint) {
        setError('Unknown data point');
        return;
      }

      const veriffLocked =
        (dataPoint.veriffCapable || VERIFF_CAPABLE_IDS.includes(dataPointId)) &&
        (verifiedDataPoints.has(dataPointId) ||
          (dataPointId === 'name_attestation' &&
            (verifiedDataPoints.has('full_name') || verifiedDataPoints.has('first_name'))) ||
          (dataPointId === 'age_attestation' &&
            (verifiedDataPoints.has('age_attestation') || verifiedDataPoints.has('over_18'))));
      if (veriffLocked) {
        setError(
          'This identity proof is Veriff-verified and locked. Changing it requires identity rekey / rotation.'
        );
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Load source row for Edit: name/age bundles use attestation id
      const loadId =
        dataPointId === 'name_attestation'
          ? 'name_attestation'
          : dataPointId === 'age_attestation'
            ? 'age_attestation'
            : dataPointId;

      let existingData = null;

      const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
      if (!credentials) {
        console.warn('[App] Credentials not available for checking existing data point');
      } else {
        let authToken: string | null = resolveOwnerApiToken();
        if (!authToken) {
          authToken = await ensureOwnerApiTokenForActiveUser();
        }
        if (authToken) {
          try {
            const { ZKPDataPointsService } = await import('../utils/zkpDataPointsService');
            const existingDataPoint = await ZKPDataPointsService.getDataPoint(
              authenticatedUser.id,
              credentials,
              authToken,
              loadId,
              authenticatedUser.publicKey
            );

            if (existingDataPoint) {
              if (existingDataPoint.verificationLevel === 'verified') {
                setError(
                  'This identity proof is Veriff-verified and locked. Changing it requires identity rekey / rotation.'
                );
                setTimeout(() => setError(null), 9000);
                return;
              }
              if (existingDataPoint.encryptedUserData) {
                try {
                  let encryptedDataObj;
                  if (typeof existingDataPoint.encryptedUserData === 'string') {
                    encryptedDataObj = JSON.parse(existingDataPoint.encryptedUserData);
                  } else if (
                    typeof existingDataPoint.encryptedUserData === 'object' &&
                    existingDataPoint.encryptedUserData !== null
                  ) {
                    encryptedDataObj = existingDataPoint.encryptedUserData;
                  } else {
                    throw new Error('Invalid encryptedUserData format');
                  }

                  const decryptedUserDataJson = await IdentityCrypto.decryptData(
                    encryptedDataObj,
                    credentials.pnName,
                    credentials.passcode
                  );
                  existingData = JSON.parse(decryptedUserDataJson);
                } catch (error) {
                  console.warn('[App] Failed to decrypt userData, will show empty form:', error);
                  existingData = null;
                }
              }
            }
          } catch (error) {
            console.warn('[App] Error checking for existing data point:', error);
          }
        }
      }

      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(existingData);
      setShowDataPointInputModal(true);
    } catch (error) {
      console.error('❌ [App] Error loading existing data, using fallback:', error);
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(null);
      setShowDataPointInputModal(true);
    }
  };

  const handleDataPointInputComplete = async (proofs: any[], userData: any) => {
    try {
      await ensureDriveCloudSession();
      const dataPointId = currentDataPoint?.id;
      if (!dataPointId) {
        throw new Error('Invalid data point');
      }

      const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
      if (!credentials) {
        throw new Error('Credentials not available');
      }

      const authToken = await resolveOwnerAuthToken();
      const identityKey = authenticatedUser.publicKey || authenticatedUser.id;
      let encryptedIdentity = await getEncryptedIdentityForApiToken(identityKey);
      if (
        !encryptedIdentity &&
        authenticatedUser.publicKey &&
        authenticatedUser.publicKey !== authenticatedUser.id
      ) {
        encryptedIdentity = await getEncryptedIdentityForApiToken(authenticatedUser.id);
      }
      if (!encryptedIdentity) {
        throw new Error('Encrypted identity required to mint ZKPs — unlock again');
      }
      const fullIdentity: EncryptedIdentity = {
        publicKey:
          (encryptedIdentity as EncryptedIdentity).publicKey ||
          authenticatedUser.publicKey ||
          identityKey,
        encryptedData: encryptedIdentity.encryptedData,
        iv: encryptedIdentity.iv,
        salt: encryptedIdentity.salt,
        mlKemPublicKey: (encryptedIdentity as EncryptedIdentity).mlKemPublicKey
      };

      const mintParams = {
        identityId: authenticatedUser.id,
        credentials,
        authToken,
        publicKey: authenticatedUser.publicKey,
        encryptedIdentity: fullIdentity,
        verificationLevel: 'basic' as const,
        encryptedUserData: undefined as string | undefined
      };

      if (userData && Object.keys(userData).length > 0) {
        try {
          const encryptedDataObj = await IdentityCrypto.encryptData(
            JSON.stringify(userData),
            credentials.pnName,
            credentials.passcode
          );
          mintParams.encryptedUserData = JSON.stringify(encryptedDataObj);
        } catch (error) {
          console.warn('Failed to encrypt userData, continuing without it:', error);
        }
      }

      const { ZKPDataPointsService } = await import('../utils/zkpDataPointsService');

      if (dataPointId === 'name_attestation') {
        if (!userData?.firstName || !userData?.lastName) {
          throw new Error('First and last name are required');
        }
        await mintDerivedNameZkps(
          {
            prefix: userData.prefix,
            firstName: userData.firstName,
            middleName: userData.middleName,
            lastName: userData.lastName,
            suffix: userData.suffix,
            nickname: userData.nickname
          },
          mintParams
        );
      } else if (dataPointId === 'age_attestation') {
        if (!userData?.dateOfBirth) {
          throw new Error('Date of birth is required');
        }
        await mintDerivedAgeZkps(userData.dateOfBirth, mintParams);
      } else {
        if (!proofs.length) {
          throw new Error('Invalid data point or proof');
        }
        const proof = proofs[0];
        await ZKPDataPointsService.saveDataPoint(
          authenticatedUser.id,
          credentials,
          authToken,
          {
            dataPointId,
            proofType: mapDataPointIdToProofType(dataPointId),
            zkpProof: proof.proof,
            signature: proof.signature || proof.proof,
            verifiedAt: proof.timestamp || new Date().toISOString(),
            expiresAt:
              proof.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            verificationLevel: proof.verificationLevel || 'basic',
            metadata: { provider: 'user_attested' },
            encryptedUserData: mintParams.encryptedUserData
          },
          authenticatedUser.publicKey
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const allDataPointIds = await ZKPDataPointsService.getAllDataPoints(
        authenticatedUser.id,
        credentials,
        authToken,
        authenticatedUser.publicKey
      );

      setAttestedDataPoints(new Set(allDataPointIds));
      setSuccessWithTimeout(`Successfully attested ${currentDataPoint?.name}!`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      setShowDataPointInputModal(false);
      setCurrentDataPoint(null);
      setCurrentDataPointExistingData(null);
    } catch (error) {
      console.error('❌ [DataPointInput] Error:', error);
      const raw = error instanceof Error ? error.message : String(error);
      const needsDrive =
        /DRIVE_NOT_INITIALIZED|cloud_token_required|connect.*google drive|Google Drive storage not initialized/i.test(
          raw
        );
      setError(
        needsDrive
          ? 'Connect or reconnect Google Drive (cloud reconnect or Storage), then retry attestation.'
          : `Failed to save data point: ${raw}`
      );
      setTimeout(() => setError(null), 9000);
    }
  };

  return {
    handleOpenToolSettings,
    handleToggleToolDataPoint,
    handleSetToolDataPointRequired,
    handleDeactivateTool,
    mapDataPointIdToProofType,
    handleRequestDataPoint,
    handleDataPointInputComplete
  };
}
