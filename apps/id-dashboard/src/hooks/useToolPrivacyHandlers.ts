/**
 * Tool permission and data-point attestation handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  attestFromTemplate,
  listHeldKnowledgeClaims,
  readAttestationSource,
  resolveAttestationKeys
} from '../services/knowledgeAttestation';
import { ownerFetch } from '../services/ownerApiService';
import { requireOwnerApiToken, resolveOwnerApiToken } from '../services/ownerApiToken';
import { STANDARD_DATA_POINTS, ID_VERIFIABLE_IDS } from '../types/StandardDataPointsRegistry';
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
  attestedDataPoints: Set<string>;
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
    attestedDataPoints,
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

  const attestationKeys = async () => {
    const identityKey = authenticatedUser.publicKey || authenticatedUser.id;
    let stored = await getEncryptedIdentityForApiToken(identityKey);
    if (!stored && authenticatedUser.publicKey && authenticatedUser.publicKey !== authenticatedUser.id) {
      stored = await getEncryptedIdentityForApiToken(authenticatedUser.id);
    }
    const encryptedIdentity: EncryptedIdentity | null = stored
      ? {
          publicKey: stored.publicKey || authenticatedUser.publicKey || identityKey,
          encryptedData: stored.encryptedData,
          iv: stored.iv,
          salt: stored.salt,
          mlKemPublicKey: (stored as { mlKemPublicKey?: string }).mlKemPublicKey
        }
      : null;
    return resolveAttestationKeys({
      identityId: authenticatedUser.id,
      publicKey: authenticatedUser.publicKey,
      encryptedIdentity
    });
  };

  const ensureDriveCloudSession = async (): Promise<void> => {
    const token = await resolveOwnerAuthToken();
    const sessionId = authenticatedUser?.id;
    if (!token || !sessionId) return;
    let pn = pnIdentifier || null;
    if (!pn) {
      try {
        const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
        pn = deriveCanonicalPnIdentifier(authenticatedUser.publicKey || sessionId);
      } catch {
        return;
      }
    }
    if (!pn) return;
    const { ensureCloudSessionBootstrap } = await import('../contexts/CloudSessionContext');
    const result = await ensureCloudSessionBootstrap({
      apiToken: token,
      pnIdentifier: pn,
      sessionId
    });
    if (result.status !== 'ready') {
      throw new Error(result.error || 'Reconnect Google Drive on this device to continue');
    }
  };

  // Tool Settings Handlers
  const handleOpenToolSettings = (toolId: string) => {
    setSelectedToolId(toolId);
    setShowToolSettingsModal(true);
  };

  const handleToggleToolDataPoint = async (toolId: string, dataPointId: string, enabled: boolean) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    if (enabled) {
      const { getDataPointMinLevel } = await import('@par-noir/standard-data-points');
      const minLevel = getDataPointMinLevel(tool.dataPointLevels, dataPointId);
      if (minLevel === 'verified' && !verifiedDataPoints.has(dataPointId)) {
        setError('This app requires a verified proof. Attested is not accepted.');
        return;
      }
      if (minLevel === 'attested' && !attestedDataPoints.has(dataPointId) && !verifiedDataPoints.has(dataPointId)) {
        setError('Create this ZKP first before sharing it.');
        return;
      }
    }

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
          optionalDataPoints: tool.optionalDataPoints || [],
          dataPointLevels: tool.dataPointLevels
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
      const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
      const pnIdentifier = deriveCanonicalPnIdentifier(authenticatedUser.publicKey || '');

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

  const handleDeactivateTool = async (toolId: string) => {
    const tool = privacySettings.toolPermissions[toolId];
    if (!tool) return;

    const newSettings = {
      ...privacySettings,
      toolPermissions: {
        ...privacySettings.toolPermissions,
        [toolId]: {
          ...tool,
          status: 'revoked' as const,
          dataPoints: []
        }
      }
    };
    setPrivacySettings(newSettings);

    try {
      const credentials = SecureCredentialManager.getCredentials(authenticatedUser?.id || '');
      if (!credentials || !authenticatedUser?.id) {
        setSuccessWithTimeout('Tool access revoked locally.');
        return;
      }
      const authToken = await resolveOwnerAuthToken();
      const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
      const pnIdentifier = deriveCanonicalPnIdentifier(authenticatedUser.publicKey || '');
      const path = `/api/users/${pnIdentifier}/third-party-permissions`;
      const response = await ownerFetch(
        authToken,
        'PUT',
        path,
        {
          toolId,
          permission: newSettings.toolPermissions[toolId]
        },
        { pnIdentifier }
      );
      if (!response.ok) {
        console.error('Failed to persist tool revoke:', response.status);
        setError('Revoked locally but failed to save to your cloud. Try again.');
        return;
      }
      setSuccessWithTimeout('Third-party access revoked.');
    } catch (error) {
      console.error('Error persisting tool revoke:', error);
      setError('Revoked locally but failed to save to your cloud. Try again.');
    }
  };

  const handleToggleGlobalDataPoint = async (dataPointId: string, allowed: boolean) => {
    const existing = privacySettings.dataPoints[dataPointId];
    const catalog = (await import('@par-noir/standard-data-points')).STANDARD_DATA_POINTS[dataPointId];
    const nextDataPoints = {
      ...privacySettings.dataPoints,
      [dataPointId]: {
        label: existing?.label || catalog?.name || dataPointId,
        description: existing?.description || catalog?.description || '',
        category: (existing?.category ||
          (catalog?.category as GlobalPrivacySettings['dataPoints'][string]['category']) ||
          'verification') as GlobalPrivacySettings['dataPoints'][string]['category'],
        requestedBy: existing?.requestedBy || [],
        globalSetting: allowed,
        lastUpdated: new Date().toISOString()
      }
    };

    const nextToolPermissions = { ...privacySettings.toolPermissions };
    if (!allowed) {
      for (const [toolId, tool] of Object.entries(nextToolPermissions)) {
        nextToolPermissions[toolId] = {
          ...tool,
          dataPoints: (tool.dataPoints || []).filter((id) => id !== dataPointId)
        };
      }
    }

    const newSettings: GlobalPrivacySettings = {
      ...privacySettings,
      dataPoints: nextDataPoints,
      toolPermissions: nextToolPermissions
    };
    setPrivacySettings(newSettings);

    // Persist each changed tool permission when disabling a point globally
    if (!allowed) {
      try {
        const credentials = SecureCredentialManager.getCredentials(authenticatedUser?.id || '');
        if (!credentials || !authenticatedUser?.id) return;
        const authToken = await resolveOwnerAuthToken();
        const { deriveCanonicalPnIdentifier } = await import('@par-noir/pqc-crypto/oauth-unlock-proof');
        const pnIdentifier = deriveCanonicalPnIdentifier(authenticatedUser.publicKey || '');
        const path = `/api/users/${pnIdentifier}/third-party-permissions`;
        await Promise.all(
          Object.entries(nextToolPermissions).map(([toolId, permission]) =>
            ownerFetch(authToken, 'PUT', path, { toolId, permission }, { pnIdentifier }).catch(
              () => undefined
            )
          )
        );
      } catch (error) {
        console.error('Error persisting global data-point disable:', error);
      }
    }
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

      const idVerifiedLocked =
        (dataPoint.idVerifiable || ID_VERIFIABLE_IDS.includes(dataPointId)) &&
        (verifiedDataPoints.has(dataPointId) ||
          (dataPointId === 'name_attestation' &&
            (verifiedDataPoints.has('full_name') || verifiedDataPoints.has('first_name'))) ||
          (dataPointId === 'age_attestation' &&
            (verifiedDataPoints.has('age_attestation') || verifiedDataPoints.has('over_18'))));
      if (idVerifiedLocked) {
        setError(
          'This identity proof is ID-verified and locked. Changing it requires identity rekey / rotation.'
        );
        setTimeout(() => setError(null), 9000);
        return;
      }

      const shouldProbe =
        dataPointId === 'name_attestation' ||
        dataPointId === 'age_attestation' ||
        attestedDataPoints.has(dataPointId);

      let existingData: Record<string, string> | null = null;
      if (shouldProbe) {
        try {
          const authToken = await resolveOwnerAuthToken();
          const keys = await attestationKeys();
          const held = (await listHeldKnowledgeClaims(keys.pnIdentifier, authToken)) || [];
          const existing = held.filter((c) => c.sourceDataPointId === dataPointId);
          if (existing.length) {
            if (existing.some((c) => c.verificationLevel === 'verified')) {
              setError(
                'This identity proof is ID-verified and locked. Changing it requires identity rekey / rotation.'
              );
              setTimeout(() => setError(null), 9000);
              return;
            }
            setAttestedDataPoints((prev) => {
              const next = new Set(prev);
              existing.forEach((c) => next.add(c.dataPointId));
              return next;
            });
            existingData = await readAttestationSource({ keys, authToken, sourceDataPointId: dataPointId });
          }
        } catch (error) {
          console.warn('[App] Could not load the existing attestation; showing an empty form:', error);
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

  const handleDataPointInputComplete = async (userData: Record<string, unknown>) => {
    try {
      await ensureDriveCloudSession();
      const dataPointId = currentDataPoint?.id;
      if (!dataPointId) {
        throw new Error('Invalid data point');
      }

      const authToken = await resolveOwnerAuthToken();
      const keys = await attestationKeys();
      await attestFromTemplate({ keys, authToken, dataPointId, userData: userData || {} });

      const held = await listHeldKnowledgeClaims(keys.pnIdentifier, authToken).catch(() => null);
      if (held) {
        setAttestedDataPoints(new Set(held.map((c) => c.dataPointId)));
      } else {
        setAttestedDataPoints((prev) => {
          const next = new Set(prev);
          next.add(dataPointId);
          return next;
        });
      }
      setSuccessWithTimeout(`Successfully attested ${currentDataPoint?.name}!`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      setShowDataPointInputModal(false);
      setCurrentDataPoint(null);
      setCurrentDataPointExistingData(null);
    } catch (error) {
      console.error('❌ [DataPointInput] Error:', error);
      const raw = error instanceof Error ? error.message : String(error);
      const needsDrive =
        /DRIVE_NOT_INITIALIZED|cloud_on_device|cloud_token_required|connect.*google drive|Google Drive storage not initialized/i.test(
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
    handleToggleGlobalDataPoint,
    mapDataPointIdToProofType,
    handleRequestDataPoint,
    handleDataPointInputComplete
  };
}
