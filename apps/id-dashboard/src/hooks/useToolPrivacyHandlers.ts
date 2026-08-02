/**
 * Tool permission and data-point attestation handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { IdentityCrypto, SecureCredentialManager } from '@par-noir/identity-crypto';
import { cloudSyncManager } from '../utils/cloudSync';
import { ownerFetch } from '../services/ownerApiService';
import { STANDARD_DATA_POINTS } from '../types/standardDataPoints';
import type { GlobalPrivacySettings } from '../types/privacy';
import type { DIDInfo, SyncedDevice } from '../types/app';

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
    setError,
    setSuccessWithTimeout,
    logDebug,
    logError
  } = params;

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

      const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
      if (!authToken) {
        console.warn('[App] Cannot persist permissions - no auth token');
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
      });

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
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      if (!dataPoint) {
        setError('Unknown data point');
        return;
      }

      // Check if user has already attested this data point - from API server (Google Drive)
      let existingData = null;
      
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
        console.warn('[App] Credentials not available for checking existing data point');
      } else {
        const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
        if (authToken) {
          try {
            // Check API server (Google Drive) for existing data point - NO localStorage
            const { ZKPDataPointsService } = await import('../utils/zkpDataPointsService');
            const existingDataPoint = await ZKPDataPointsService.getDataPoint(
              authenticatedUser.id,
              credentials,
              authToken,
              dataPointId,
              authenticatedUser.publicKey
            );
            
            if (existingDataPoint) {
              console.log('[App] Found existing data point in API:', existingDataPoint.dataPointId);
              
              // Decrypt userData if available for editing
              if (existingDataPoint.encryptedUserData) {
                try {
                  // SECURITY: Decryption requires BOTH pnName and passcode
                  // encryptedUserData is stored as JSON string of EncryptedData object
                  // Handle both string and object cases (API might return object directly)
                  let encryptedDataObj;
                  if (typeof existingDataPoint.encryptedUserData === 'string') {
                    try {
                      encryptedDataObj = JSON.parse(existingDataPoint.encryptedUserData);
                    } catch (parseError) {
                      // If parsing fails, it might be "[object Object]" string or invalid format
                      console.warn('[App] Failed to parse encryptedUserData string:', parseError);
                      throw new Error('Invalid encryptedUserData format');
                    }
                  } else if (typeof existingDataPoint.encryptedUserData === 'object' && existingDataPoint.encryptedUserData !== null) {
                    // Already an object (from API JSON response)
                    encryptedDataObj = existingDataPoint.encryptedUserData;
                  } else {
                    throw new Error('encryptedUserData is neither string nor object');
                  }
                  
                  const decryptedUserDataJson = await IdentityCrypto.decryptData(
                    encryptedDataObj,
                    credentials.pnName,
                    credentials.passcode
                  );
                  existingData = JSON.parse(decryptedUserDataJson);
                  console.log('[App] Decrypted existing userData for editing:', existingData);
                } catch (error) {
                  console.warn('[App] Failed to decrypt userData, will show empty form:', error);
                  existingData = null;
                }
              }
            }
          } catch (error) {
            console.warn('[App] Error checking for existing data point:', error);
            // Continue without existing data
          }
        }
      }
      
      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(existingData);
      console.log('🔄 [App] Opening DataPointInputModal', {
        dataPointId,
        dataPointName: dataPoint.name,
        hasExistingData: !!existingData
      });
      setShowDataPointInputModal(true);
    } catch (error) {
      console.error('❌ [App] Error loading existing data, using fallback:', error);
      // Fallback to new data collection
      const dataPoint = STANDARD_DATA_POINTS[dataPointId];
      setCurrentDataPoint(dataPoint);
      setCurrentDataPointExistingData(null);
      console.log('🔄 [App] Opening DataPointInputModal (fallback)', {
        dataPointId,
        dataPointName: dataPoint.name
      });
      setShowDataPointInputModal(true);
    }
  };

    const handleDataPointInputComplete = async (proofs: any[], userData: any) => {
    console.log('🔄 [DataPointInput] handleDataPointInputComplete called', { 
      proofsCount: proofs.length, 
      dataPointId: currentDataPoint?.id,
      hasUserData: !!userData 
    });
      
    try {
      const dataPointId = currentDataPoint?.id;
      if (!dataPointId || proofs.length === 0) {
        throw new Error('Invalid data point or proof');
      }

      const proof = proofs[0];
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser.id);
        if (!credentials) {
        throw new Error('Credentials not available');
        }
        
      const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
      if (!authToken) {
        throw new Error('No access token available. Please re-authenticate.');
        }
        
      // Convert to API format
      const { ZKPDataPointsService } = await import('../utils/zkpDataPointsService');
        
      // Encrypt userData for storage (so it can be retrieved for editing)
      let encryptedUserData: string | undefined;
      if (userData && Object.keys(userData).length > 0) {
        try {
          const userDataJson = JSON.stringify(userData);
          // SECURITY: Encryption requires BOTH pnName and passcode
          const encryptedDataObj = await IdentityCrypto.encryptData(
            userDataJson,
            credentials.pnName,
            credentials.passcode
          );
          // Serialize EncryptedData object to string for storage
          encryptedUserData = JSON.stringify(encryptedDataObj);
        } catch (error) {
          console.warn('Failed to encrypt userData, continuing without it:', error);
        }
      }
      
            const zkpDataPoint = {
              dataPointId: dataPointId,
              proofType: mapDataPointIdToProofType(dataPointId),
              zkpProof: proof.proof,
        signature: proof.signature || proof.proof,
              verifiedAt: proof.timestamp || new Date().toISOString(),
        expiresAt: proof.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              verificationLevel: proof.verificationLevel || 'basic',
              metadata: {
                provider: 'user_attested',
                fraudPreventionScore: undefined
        },
        encryptedUserData: encryptedUserData
      };

      // Save directly to API server (Google Drive) - NO localStorage
      console.log('🔄 [ZKP Save] Saving directly to API server (Google Drive)...');
      await ZKPDataPointsService.saveDataPoint(
        authenticatedUser.id,
        credentials,
        authToken,
        zkpDataPoint,
        authenticatedUser.publicKey
      );

      // Wait for Google Drive to sync
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify by reading back from API
      console.log('🔄 [ZKP Verify] Verifying save...');
      const verified = await ZKPDataPointsService.hasDataPoint(
        authenticatedUser.id,
        credentials,
        authToken,
        dataPointId,
        authenticatedUser.publicKey
      );
              
      if (!verified) {
        throw new Error('Verification failed - data point not found after save');
      }

      // Reload all data points from API
      const allDataPointIds = await ZKPDataPointsService.getAllDataPoints(
        authenticatedUser.id,
        credentials,
        authToken,
        authenticatedUser.publicKey
      );
      
      console.log('✅ [ZKP] Successfully saved and verified. All data points:', allDataPointIds);
      setAttestedDataPoints(new Set(allDataPointIds));
      
      setSuccessWithTimeout(`Successfully attested ${currentDataPoint?.name}!`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      setShowDataPointInputModal(false);
      setCurrentDataPoint(null);
      setCurrentDataPointExistingData(null);
    } catch (error) {
      console.error('❌ [DataPointInput] Error:', error);
      setError(`Failed to save data point: ${error instanceof Error ? error.message : String(error)}`);
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
