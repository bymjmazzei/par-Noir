/**
 * Recovery and custodian handlers for the dashboard.
 *
 * This is the single hook App.tsx calls for recovery/custodian behavior. The pure
 * authorization primitives it drives live in `components/recovery/useRecoveryHandlers`
 * (initiate from .pn file, ZK approval, vault share fetch); this hook wires those into
 * dashboard state, cloud sync and the UI modals.
 */
import type React from 'react';
import QRCode from 'qrcode';
import { IdentityCrypto } from '@par-noir/identity-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import type { RecoveryEnvelope, ShamirShare } from '@par-noir/recovery-crypto';
import { QRCodeManager } from '../utils/qrCode';
import { cloudSyncManager } from '../utils/cloudSync';
import { LicenseVerification } from '../utils/licenseVerification';
import { completeRecoveryWithShares, markRecoveryRequestCompleted, markRecoveryRequestExpired } from '../services/recoveryService';
import { revokeRecoveryCustodian, acceptRecoveryCustodianship } from '../services/recoveryApiService';
import { getRecoveryAuthSession, recoveryAuthRequiredMessage } from '../services/recoveryAuthSession';
import {
  clearRecoveryActiveSession,
  getRecoveryActiveSession,
  setRecoveryActiveSession,
  touchRecoveryActiveSession,
  updateRecoveryActiveSession,
} from '../services/recoveryActiveSession';
import { storeCustodianshipCredential } from '../services/recoveryCredentialStorage';
import type { SecureStorage } from '../utils/storage';
import type {
  CustodianInvitationForm,
  DIDInfo,
  RecoveryCustodian,
  RecoveryKey,
  RecoveryRequest,
  SyncedDevice
} from '../types/app';
import type { useDeviceAuthState } from './useDeviceAuthState';
import type { useRecoveryVaultState } from './useRecoveryVaultState';

export interface CustodianshipEntry {
  id: string;
  identityId: string;
  identityName: string;
  identityUsername: string;
  identityPublicKey?: string;
  status: 'active' | 'pending';
  canApprove: boolean;
}

export interface PendingRecoveryCompletion {
  requestId: string;
  envelope: RecoveryEnvelope;
  existingIdentity: EncryptedIdentity;
  shares: ShamirShare[];
}

export interface CustodianContactInfo {
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
  passcode: string;
}

export interface RecoveryKeyContactInfo {
  contactType: 'email' | 'phone';
  contactValue: string;
  claimantName: string;
}

export interface CustodianAcceptanceData {
  contactType: 'email' | 'phone';
  contactValue: string;
  passcode: string;
}

export interface UseRecoveryCustodianHandlersParams {
  storage: SecureStorage;
  apiToken: string | null;
  authenticatedUser: any;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  selectedDID: DIDInfo | null;
  dids: DIDInfo[];
  recoveryVaultPnId: string | null;
  recoveryVaultSummary: ReturnType<typeof useRecoveryVaultState>['summary'];
  refreshRecoveryVault: () => Promise<void> | void;
  getEncryptedIdentityForApiToken: (
    identityPublicKeyOrId: string | undefined
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;

  canManageCustodians: boolean;
  canExportIdentity: boolean;
  deviceAuth: ReturnType<typeof useDeviceAuthState>;

  recoveryThreshold: number;
  custodians: RecoveryCustodian[];
  setCustodians: React.Dispatch<React.SetStateAction<RecoveryCustodian[]>>;
  recoveryRequests: RecoveryRequest[];
  setRecoveryRequests: React.Dispatch<React.SetStateAction<RecoveryRequest[]>>;
  recoveryKeys: RecoveryKey[];
  setRecoveryKeys: React.Dispatch<React.SetStateAction<RecoveryKey[]>>;
  custodianships: CustodianshipEntry[];
  setCustodianships: React.Dispatch<React.SetStateAction<CustodianshipEntry[]>>;

  custodianContactInfo: CustodianContactInfo;
  setCustodianContactInfo: React.Dispatch<React.SetStateAction<CustodianContactInfo>>;
  setCustodianQRCode: React.Dispatch<React.SetStateAction<string>>;
  selectedCustodianForInvitation: any;

  custodianAcceptanceData: CustodianAcceptanceData;
  setCustodianAcceptanceData: React.Dispatch<React.SetStateAction<CustodianAcceptanceData>>;
  pendingCustodianInvitationData: any;
  setPendingCustodianInvitationData: React.Dispatch<React.SetStateAction<any>>;
  setShowCustodianAcceptanceModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCustodianInvitationModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingCustodianInvitation: React.Dispatch<React.SetStateAction<any>>;
  setShowAddCustodianModal: React.Dispatch<React.SetStateAction<boolean>>;

  setShowRecoveryModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRecoveryKeyModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRecoveryKeyInputModal: React.Dispatch<React.SetStateAction<boolean>>;
  setRecoveryKeyInput: React.Dispatch<React.SetStateAction<string>>;
  setRecoveryKeyContactInfo: React.Dispatch<React.SetStateAction<RecoveryKeyContactInfo>>;

  pendingRecoveryCompletion: PendingRecoveryCompletion | null;
  setPendingRecoveryCompletion: React.Dispatch<React.SetStateAction<PendingRecoveryCompletion | null>>;
  setShowRecoveryPasscodeModal: React.Dispatch<React.SetStateAction<boolean>>;
  recoveredIdentityExport: EncryptedIdentity | null;
  setRecoveredIdentityExport: React.Dispatch<React.SetStateAction<EncryptedIdentity | null>>;
  recoveredDID: DIDInfo | null;
  setRecoveredDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  setShowRecoveryCompleteModal: React.Dispatch<React.SetStateAction<boolean>>;

  setSelectedRecoveryRequest: React.Dispatch<React.SetStateAction<RecoveryRequest | null>>;
  setSelectedCustodianship: React.Dispatch<React.SetStateAction<CustodianshipEntry | null>>;
  setShowCustodianApprovalModal: React.Dispatch<React.SetStateAction<boolean>>;

  currentDevice: SyncedDevice | null;
  setCurrentDevice: React.Dispatch<React.SetStateAction<SyncedDevice | null>>;
  generateDeviceFingerprint: () => string;
  generateSyncKey: () => string;

  setLicenseKey: React.Dispatch<React.SetStateAction<string>>;
  setLicenseInfo: React.Dispatch<React.SetStateAction<any>>;
  setLicenseProof: React.Dispatch<React.SetStateAction<any>>;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useRecoveryCustodianHandlers(params: UseRecoveryCustodianHandlersParams) {
  const {
    storage,
    apiToken,
    authenticatedUser,
    setAuthenticatedUser,
    selectedDID,
    dids,
    recoveryVaultPnId,
    recoveryVaultSummary,
    refreshRecoveryVault,
    getEncryptedIdentityForApiToken,
    canManageCustodians,
    canExportIdentity,
    deviceAuth,
    recoveryThreshold,
    custodians,
    setCustodians,
    recoveryRequests,
    setRecoveryRequests,
    recoveryKeys,
    setRecoveryKeys,
    custodianships,
    setCustodianships,
    custodianContactInfo,
    setCustodianContactInfo,
    setCustodianQRCode,
    selectedCustodianForInvitation,
    custodianAcceptanceData,
    setCustodianAcceptanceData,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    setShowCustodianAcceptanceModal,
    setShowCustodianInvitationModal,
    setPendingCustodianInvitation,
    setShowAddCustodianModal,
    setShowRecoveryModal,
    setShowRecoveryKeyModal,
    setShowRecoveryKeyInputModal,
    setRecoveryKeyInput,
    setRecoveryKeyContactInfo,
    pendingRecoveryCompletion,
    setPendingRecoveryCompletion,
    setShowRecoveryPasscodeModal,
    recoveredIdentityExport,
    setRecoveredIdentityExport,
    recoveredDID,
    setRecoveredDID,
    setShowRecoveryCompleteModal,
    setSelectedRecoveryRequest,
    setSelectedCustodianship,
    setShowCustodianApprovalModal,
    currentDevice,
    setCurrentDevice,
    generateDeviceFingerprint,
    generateSyncKey,
    setLicenseKey,
    setLicenseInfo,
    setLicenseProof,
    setLoading,
    setError,
    setSuccessWithTimeout,
    logDebug,
    logError
  } = params;

  // Recovery functions
  const handleInitiateRecovery = async (recoveryData: {
    pnName: string;
    passcode: string;
    nickname: string;
    emailOrPhone: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Get stored identities
      const storedIdentities = await storage.getIdentities();

      // Find the identity to recover
      const foundIdentity = storedIdentities.find(stored => {
        try {
          // Try to decrypt and verify the identity
          const decryptedData = JSON.parse(stored.encryptedData);
          return (
            decryptedData.pnName === recoveryData.pnName &&
            decryptedData.nickname === recoveryData.nickname &&
            (decryptedData.recoveryEmail === recoveryData.emailOrPhone ||
             decryptedData.recoveryPhone === recoveryData.emailOrPhone)
          );
        } catch {
          return false;
        }
      });

      if (!foundIdentity) {
        throw new Error('No matching PN found. Please check your information.');
      }

      // Verify passcode cryptographically
      const isValidPasscode = await IdentityCrypto.verifyPasscode(
        recoveryData.passcode,
        foundIdentity.encryptedData,
        foundIdentity.salt
      );

      if (!isValidPasscode) {
        throw new Error('Invalid passcode. Please check your information.');
      }

      // Create recovery request with old identity hash for license transfer
      const recoveryRequest: RecoveryRequest = {
        id: `recovery-${Date.now()}`,
        requestingDid: foundIdentity.publicKey, // Use public key since ID is encrypted
        requestingUser: recoveryData.pnName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        denials: [],
        signatures: [], // ZK proof signatures will be added here
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 72 hours
        requiredApprovals: recoveryThreshold,
        currentApprovals: 0,
        oldIdentityHash: foundIdentity.publicKey // In real implementation, this would be the actual old identity hash
      };

      setRecoveryRequests(prev => [...prev, recoveryRequest]);
      setShowRecoveryModal(false);
      setSuccessWithTimeout('Recovery request initiated! Notifying custodians...');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const generateCustodianQRCode = async (custodianData: CustodianInvitationForm & { id?: string }) => {
    try {
      const recoveryAuth = getRecoveryAuthSession();
      if (!recoveryAuth) {
        throw new Error(recoveryAuthRequiredMessage());
      }
      if (!canManageCustodians) {
        throw new Error(deviceAuth.deviceRequiredMessage);
      }
      const custodianId = custodianData.id || selectedCustodianForInvitation?.id;
      if (!custodianId || !authenticatedUser?.id) {
        throw new Error('Select a custodian and unlock your identity first');
      }
      const encryptedIdentity = recoveryAuth.encryptedIdentity;
      const invitationId = `inv-${Date.now()}`;
      const existingCustodian = custodians.find((c) => c.id === custodianId);
      const vaultInvited = recoveryVaultSummary?.custodians.some(
        (c) =>
          c.custodianId === custodianId
          && c.status !== 'revoked'
          && c.status !== 'accepted'
      );
      const pnId = recoveryVaultPnId || authenticatedUser.id;
      const { assignCustodianVaultAndIssueCredential } = await import('../services/recoveryCustodianSetup');
      const vault = await assignCustodianVaultAndIssueCredential({
        custodianId,
        custodianName: custodianData.name,
        custodianType: custodianData.type,
        identityId: authenticatedUser.id,
        encryptedIdentity,
        invitationId,
        threshold: recoveryThreshold,
        apiToken,
        userPnIdentifier: pnId,
        pnName: recoveryAuth.pnName,
        passcode: recoveryAuth.passcode,
        unrevokable: custodianData.unrevokable === true,
        resendExisting: Boolean(vaultInvited || existingCustodian?.status === 'pending'),
      });

      const invitationData = {
        invitationId,
        custodianId,
        custodianName: custodianData.name,
        custodianType: custodianData.type === 'self' ? 'self-recovery' : custodianData.type,
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000),
        identityName: authenticatedUser?.nickname || 'Unknown Identity',
        identityUsername: authenticatedUser?.nickname || authenticatedUser?.id || 'unknown',
        identityPublicKey: encryptedIdentity.publicKey,
        shareIndex: vault.shareIndex,
        custodianshipZkp: vault.custodianshipZkp
      };

      const deepLinkData = {
        invitationId: invitationData.invitationId,
        custodianId: invitationData.custodianId,
        custodianName: invitationData.custodianName,
        custodianType: invitationData.custodianType,
        contactType: invitationData.contactType,
        contactValue: invitationData.contactValue,
        identityName: invitationData.identityName,
        identityUsername: invitationData.identityUsername,
        identityPublicKey: invitationData.identityPublicKey,
        shareIndex: invitationData.shareIndex,
        custodianshipZkp: invitationData.custodianshipZkp
      };

      setCustodians(prev => prev.map(c =>
        c.id === custodianId
          ? { ...c, status: 'pending' as const, canApprove: false, lastVerified: new Date().toISOString() }
          : c
      ));

      void refreshRecoveryVault();

      const deepLink = `${window.location.origin}?custodian-invitation=${encodeURIComponent(JSON.stringify(deepLinkData))}`;

      // Generate QR code with deep link
      const qrCodeDataURL = await QRCode.toDataURL(deepLink, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      setCustodianQRCode(qrCodeDataURL);
      setCustodianContactInfo(custodianData);
    } catch (error) {
      logError('Failed to generate QR code:', error);
    }
  };

  const handleContactAction = (contactType: 'email' | 'phone', contactValue: string) => {
    // Generate the direct link for custodian invitation
    const invitationData = {
      invitationId: `inv-${Date.now()}`,
      custodianName: custodianContactInfo.name,
      custodianType: custodianContactInfo.type === 'self' ? 'self-recovery' : custodianContactInfo.type,
      contactType: custodianContactInfo.contactType,
      contactValue: custodianContactInfo.contactValue,
      identityName: authenticatedUser?.nickname || 'Unknown Identity',
      identityUsername: authenticatedUser?.pnName || 'unknown',
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    const directLink = `${window.location.origin}?custodian-invitation=${encodeURIComponent(JSON.stringify(invitationData))}`;

    if (contactType === 'email') {
      const subject = 'Identity Protocol - Custodian Invitation';
      const body = `You have been invited to be a recovery custodian for ${authenticatedUser?.nickname || 'an identity'}.

To accept this custodianship:
1. Click this link: ${directLink}
2. Unlock your pN identity
3. Enter the passcode provided by the identity owner
4. Confirm the custodianship

This invitation expires in 24 hours.`;
      window.open(`mailto:${contactValue}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } else if (contactType === 'phone') {
      const message = `You've been invited as a custodian for ${authenticatedUser?.nickname || 'an identity'}. Click: ${directLink} (Passcode required)`;
      window.open(`sms:${contactValue}?body=${encodeURIComponent(message)}`);
    }
  };

  const handleAddCustodian = async (custodianData: CustodianInvitationForm) => {
    try {
      if (!getRecoveryAuthSession()) {
        throw new Error(recoveryAuthRequiredMessage());
      }
      if (!canManageCustodians) {
        throw new Error(deviceAuth.deviceRequiredMessage);
      }
      // Validate contact information
      if (!custodianData.name.trim() || !custodianData.contactValue.trim()) {
        throw new Error('Name and contact information are required');
      }

      // Check if we already have 5 custodians (maximum)
      if (custodians.length >= 5) {
        throw new Error('You can only have up to 5 custodians');
      }

      // Add custodian as pending
      const newCustodian: RecoveryCustodian = {
        id: `custodian-${Date.now()}`,
        identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
        name: custodianData.name,
        type: custodianData.type,
        status: 'pending', // Start as pending
        addedAt: new Date().toISOString(),
        canApprove: false, // Cannot approve until validated
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        publicKey: crypto.randomUUID(), // Generate a unique public key
        trustLevel: 'medium', // Default trust level
        passcode: custodianData.passcode // Store the 6-digit passcode
      };

      setCustodians(prev => [...prev, newCustodian]);
      setShowAddCustodianModal(false);

      // Store custodian update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'custodian',
          identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'add',
            custodian: newCustodian
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Custodian update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store custodian update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }

      setSuccessWithTimeout('Custodian added as pending! Use the "Send Invitation" button to generate and send the QR code. Changes will sync across platforms.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to add custodian');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle custodian invitation acceptance — store ZK custodianship credential only (no share bytes)
  const handleCustodianAcceptance = async () => {
    try {
      if (!pendingCustodianInvitationData) {
        throw new Error('No pending invitation found');
      }

      if (!custodianAcceptanceData.contactValue.trim() || !custodianAcceptanceData.passcode.trim()) {
        throw new Error('Please enter your contact information and the passcode');
      }

      if (custodianAcceptanceData.contactValue !== pendingCustodianInvitationData.contactValue) {
        throw new Error('Contact information does not match the invitation');
      }

      const acceptancePasscode = custodianAcceptanceData.passcode.trim();
      const isValidPasscode = /^\d{6}$/.test(acceptancePasscode);
      if (!isValidPasscode) {
        throw new Error('Invalid passcode. Enter the 6-digit code from the identity owner.');
      }

      const invitation = pendingCustodianInvitationData as {
        custodianId?: string;
        identityPublicKey?: string;
        shareIndex?: number;
        custodianshipZkp?: string;
        identityName?: string;
        identityUsername?: string;
        invitationId?: string;
      };

      if (!invitation.custodianshipZkp || !invitation.custodianId || !invitation.identityPublicKey) {
        throw new Error('Invitation is missing custodianship credential. Ask the owner to resend the invitation.');
      }

      storeCustodianshipCredential({
        custodianId: invitation.custodianId,
        identityPublicKey: invitation.identityPublicKey,
        identityName: invitation.identityName || 'Identity',
        identityUsername: invitation.identityUsername || '',
        shareIndex: invitation.shareIndex || 0,
        custodianshipZkp: invitation.custodianshipZkp,
        custodianPasscode: acceptancePasscode,
        acceptedAt: new Date().toISOString()
      });

      if (apiToken && invitation.identityPublicKey) {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const ownerPn = await VolumeIdGenerator.generateCanonicalVolumeId(invitation.identityPublicKey);
        await acceptRecoveryCustodianship(ownerPn, apiToken, invitation.custodianId, invitation.custodianshipZkp);
      }

      const newCustodianship = {
        id: `custodianship-${invitation.custodianId}`,
        identityId: invitation.invitationId || invitation.custodianId,
        identityName: invitation.identityName || 'Identity',
        identityUsername: invitation.identityUsername || '',
        identityPublicKey: invitation.identityPublicKey,
        status: 'active' as const,
        canApprove: true
      };

      setCustodianships(prev => {
        const filtered = prev.filter(
          (c) => c.identityPublicKey !== invitation.identityPublicKey
        );
        return [...filtered, newCustodianship];
      });

      setShowCustodianAcceptanceModal(false);
      setPendingCustodianInvitationData(null);
      setCustodianAcceptanceData({ contactType: 'email', contactValue: '', passcode: '' });

      setSuccessWithTimeout('Custodianship accepted. You hold an authorization credential only — no secret shares.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to accept custodianship');
      setTimeout(() => setError(null), 9000);
    }
  };

  // ZK authorization recovery approval (custodian never submits share bytes)
  const handleApproveRecovery = async (requestId: string, custodianshipId: string) => {
    try {
      setLoading(true);
      setError(null);

      const recoveryRequest = recoveryRequests.find((req) => req.id === requestId);
      const custodianship = custodianships.find((c) => c.id === custodianshipId);
      const identityPublicKey =
        custodianship?.identityPublicKey || recoveryRequest?.requestingDid || '';

      if (!recoveryRequest && !custodianship) {
        throw new Error('Recovery request not found');
      }

      const cred = (await import('../services/recoveryCredentialStorage')).getCustodianshipCredential(
        identityPublicKey,
        custodianshipId.replace('custodianship-', '')
      ) || (await import('../services/recoveryCredentialStorage')).getCustodianshipCredential(
        identityPublicKey,
        custodianship?.identityId || ''
      );

      const custodianId = cred?.custodianId || custodianshipId.replace('custodianship-', '');
      const custodianPasscode = cred?.custodianPasscode || '';

      const { approveRecoveryWithZkp } = await import('../components/recovery/useRecoveryHandlers');
      let userPnIdentifier = identityPublicKey;
      if (apiToken && identityPublicKey) {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        userPnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(identityPublicKey);
      }

      let custodianEncryptedIdentity: EncryptedIdentity | undefined;
      if (authenticatedUser?.id) {
        const encPartial = await getEncryptedIdentityForApiToken(authenticatedUser.publicKey || authenticatedUser.id);
        if (encPartial) {
          custodianEncryptedIdentity = {
            publicKey: authenticatedUser.publicKey || authenticatedUser.id,
            encryptedData: encPartial.encryptedData,
            iv: encPartial.iv,
            salt: encPartial.salt
          };
        }
      }

      const { stored, thresholdMet } = await approveRecoveryWithZkp({
        requestId,
        custodianId,
        identityPublicKey,
        custodianPasscode,
        threshold: recoveryThreshold,
        authToken: apiToken || undefined,
        userPnIdentifier,
        custodianIdentityId: authenticatedUser?.id,
        custodianEncryptedIdentity
      });

      setRecoveryRequests((prev) =>
        prev.map((req) =>
          req.id === requestId
            ? {
                ...req,
                approvals: [...req.approvals, custodianId],
                proofs: [...(req.proofs || []), custodianId],
                signatures: [...req.signatures, custodianId]
              }
            : req
        )
      );

      if (thresholdMet) {
        const active = getRecoveryActiveSession();
        if (active?.requestId === requestId) {
          updateRecoveryActiveSession({ status: 'ready' });
          if (active.callbackContact) {
            notifyCallbackContactReady(active.callbackContact);
          }
        }
        setSuccessWithTimeout(
          'Threshold met. The owner should Continue on their Recover session to set Key 1 and Key 2.'
        );
        setTimeout(() => setSuccessWithTimeout(null), 6000);
      } else {
        setSuccessWithTimeout('Recovery authorization submitted. Waiting for more custodians…');
        setTimeout(() => setSuccessWithTimeout(null), 5000);
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Recovery approval failed');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const notifyCallbackContactReady = (contact: string) => {
    const message =
      'Your par Noir recovery is ready. Open Recover within 20 minutes and Continue to set new Key 1 and Key 2.';
    const looksEmail = contact.includes('@');
    if (looksEmail) {
      window.open(
        `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent('par Noir recovery ready')}&body=${encodeURIComponent(message)}`
      );
    } else {
      window.open(`sms:${contact}?body=${encodeURIComponent(message)}`);
    }
  };

  const notifyCustodiansOfRecovery = (opts: {
    requestId: string;
    callbackContact?: string;
  }) => {
    const dashboardUrl = `${window.location.origin}`;
    const message = `A par Noir recovery request (${opts.requestId}) needs your approval. Open the dashboard Recovery tab: ${dashboardUrl}`;
    const contacts: Array<{ type: 'email' | 'phone'; value: string }> = [];
    for (const c of custodians) {
      if (c.contactValue && c.status === 'active') {
        contacts.push({
          type: c.contactValue.includes('@') ? 'email' : 'phone',
          value: c.contactValue,
        });
      }
    }
    if (recoveryVaultSummary?.custodians) {
      for (const c of recoveryVaultSummary.custodians) {
        const anyC = c as { contactValue?: string; status?: string; name?: string };
        if (anyC.contactValue && anyC.status === 'accepted') {
          contacts.push({
            type: anyC.contactValue.includes('@') ? 'email' : 'phone',
            value: anyC.contactValue,
          });
        }
      }
    }
    const seen = new Set<string>();
    let opened = 0;
    for (const contact of contacts) {
      if (seen.has(contact.value) || opened >= 2) continue;
      seen.add(contact.value);
      opened += 1;
      if (contact.type === 'email') {
        window.open(
          `mailto:${encodeURIComponent(contact.value)}?subject=${encodeURIComponent('par Noir recovery approval needed')}&body=${encodeURIComponent(message)}`
        );
      } else {
        window.open(`sms:${contact.value}?body=${encodeURIComponent(message)}`);
      }
    }
    if (seen.size === 0) {
      setSuccessWithTimeout(
        'Recovery started. Ask your custodians to open the Recovery tab and approve. No custodian contacts were available to auto-notify.'
      );
    }
  };

  const handleInitiateRecoveryFromPn = async (file: File, emailOrPhone: string) => {
    try {
      setLoading(true);
      setError(null);
      if (!emailOrPhone.trim()) {
        throw new Error('Callback contact is required');
      }
      const { initiateRecoveryFromPnFile } = await import('../components/recovery/useRecoveryHandlers');
      const req = await initiateRecoveryFromPnFile({
        file,
        emailOrPhone,
        threshold: recoveryThreshold,
        authToken: apiToken
      });
      const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
      const pnIdentifier = await VolumeIdGenerator.generateCanonicalVolumeId(req.publicKey);
      const envelopeRaw = sessionStorage.getItem(`pn_recovery_envelope_${req.id}`);
      const identityRaw = sessionStorage.getItem(`pn_recovery_identity_${req.id}`);
      if (!envelopeRaw) {
        throw new Error('Recovery envelope missing after initiate');
      }
      setRecoveryActiveSession({
        requestId: req.id,
        publicKey: req.publicKey,
        pnIdentifier,
        callbackContact: emailOrPhone.trim(),
        envelope: JSON.parse(envelopeRaw),
        existingIdentity: identityRaw ? JSON.parse(identityRaw) : undefined,
        threshold: recoveryThreshold,
        approvalCount: 0,
        status: 'pending',
      });
      setRecoveryRequests((prev) => [
        ...prev,
        {
          id: req.id,
          requestingDid: req.publicKey,
          requestingUser: emailOrPhone || 'Claimant',
          timestamp: new Date().toISOString(),
          status: 'pending',
          approvals: [],
          denials: [],
          signatures: [],
          proofs: [],
          expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          requiredApprovals: recoveryThreshold,
          currentApprovals: 0,
          oldIdentityHash: req.publicKey,
          claimantContactValue: emailOrPhone
        }
      ]);
      notifyCustodiansOfRecovery({ requestId: req.id, callbackContact: emailOrPhone });
      setSuccessWithTimeout('Recovery started. Custodians will be notified to approve.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to start recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryPasscodeSubmit = async (newPnName: string, newPasscode: string) => {
    if (!pendingRecoveryCompletion) return;
    const completion = pendingRecoveryCompletion;
    setLoading(true);
    try {
      const result = await completeRecoveryWithShares({
        envelope: completion.envelope,
        shares: completion.shares,
        newPnName,
        newPasscode,
        existingIdentity: completion.existingIdentity
      });

      const simpleStorage = (await import('../utils/simpleStorage')).SimpleStorage.getInstance();
      const { PNNameHash } = await import('../utils/security/pnNameHash');
      const pnNameHash = await PNNameHash.getLookupKey(result.pnName);
      await simpleStorage.storeIdentity({
        id: result.identity.publicKey,
        nickname: result.pnName,
        pnNameHash,
        publicKey: result.identity.publicKey,
        encryptedData: result.identity,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      });

      const authSession = await IdentityCrypto.authenticateIdentity(
        result.identity,
        newPasscode,
        result.pnName
      );
      setAuthenticatedUser(authSession);
      setRecoveredIdentityExport(result.identity);
      setShowRecoveryPasscodeModal(false);
      setPendingRecoveryCompletion(null);
      markRecoveryRequestCompleted(completion.requestId);
      clearRecoveryActiveSession();
      setRecoveryRequests((prev) =>
        prev.filter((r) => r.id !== completion.requestId)
      );
      setRecoveredDID({
        id: authSession.id,
        pnName: result.pnName,
        nickname: authSession.nickname || result.pnName,
        email: '',
        phone: '',
        recoveryEmail: '',
        recoveryPhone: '',
        createdAt: new Date().toISOString(),
        status: 'active',
        custodiansRequired: true,
        custodiansSetup: true,
        isEncrypted: true,
        displayName: authSession.nickname || result.pnName,
        publicKey: result.identity.publicKey
      });
      setShowRecoveryCompleteModal(true);
      setShowRecoveryModal(false);
      setSuccessWithTimeout('Recovery complete. Download your updated .pn file and reconnect Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueReadyRecovery = async () => {
    const session = getRecoveryActiveSession();
    if (!session) {
      setError('Recovery session expired. Start recovery again.');
      setTimeout(() => setError(null), 9000);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { fetchSharesAfterThreshold } = await import('../components/recovery/useRecoveryHandlers');
      const shares = await fetchSharesAfterThreshold({
        userPnIdentifier: session.pnIdentifier,
        authToken: apiToken || null,
        requestId: session.requestId,
        identityPublicKey: session.publicKey,
      });
      const existingIdentity: EncryptedIdentity =
        session.existingIdentity ||
        ({
          publicKey: session.publicKey,
          encryptedData: '',
          iv: '',
          salt: '',
        } as EncryptedIdentity);
      setPendingRecoveryCompletion({
        requestId: session.requestId,
        envelope: session.envelope,
        existingIdentity,
        shares,
      });
      updateRecoveryActiveSession({ status: 'ready' });
      setShowRecoveryPasscodeModal(true);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Could not continue recovery');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCustodianNotify = () => {
    const session = touchRecoveryActiveSession();
    if (!session) {
      setError('No active recovery session');
      setTimeout(() => setError(null), 9000);
      return;
    }
    notifyCustodiansOfRecovery({
      requestId: session.requestId,
      callbackContact: session.callbackContact,
    });
    setSuccessWithTimeout('Custodian notifications resent. Session timer refreshed.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleCancelActiveRecovery = (opts?: { silent?: boolean }) => {
    const session = getRecoveryActiveSession();
    if (session) {
      markRecoveryRequestExpired(session.requestId);
      setRecoveryRequests((prev) => prev.filter((r) => r.id !== session.requestId));
    }
    clearRecoveryActiveSession();
    setPendingRecoveryCompletion(null);
    setShowRecoveryPasscodeModal(false);
    if (!opts?.silent) {
      setSuccessWithTimeout('Recovery cancelled. You can start again.');
      setTimeout(() => setSuccessWithTimeout(null), 4000);
    }
  };

  // Recovery denial handler (currently unused but available for future use)
  const handleDenyRecovery = (requestId: string, custodianId: string) => {
    setRecoveryRequests(prev => {
      const updatedRequests = prev.map(req =>
        req.id === requestId
          ? { ...req, denials: [...req.denials, custodianId] }
          : req
      );

      // Check if enough denials to reject the recovery
      const updatedRequest = updatedRequests.find(req => req.id === requestId);
      if (updatedRequest && updatedRequest.denials.length >= recoveryThreshold) {
        // Recovery denied - update status
        const finalUpdatedRequests = updatedRequests.map(req =>
          req.id === requestId
            ? { ...req, status: 'denied' as const }
            : req
        );
        return finalUpdatedRequests;
      }

      return updatedRequests;
    });

    setSuccessWithTimeout('Recovery denied.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleGenerateRecoveryKey = async (purpose: RecoveryKey['purpose'], description?: string) => {
    try {
      setLoading(true);
      setError(null);

      await storage.init();

      const keyData = await IdentityCrypto.generateRecoveryKey(
        authenticatedUser?.id || 'unknown',
        purpose
      );

      const publicKey = authenticatedUser?.publicKey || '';
      const pnId = recoveryVaultPnId;
      if (!apiToken || !pnId || !publicKey) {
        throw new Error('Sign in and connect storage before creating a recovery key.');
      }

      const { getRecoveryAuthSession } = await import('../services/recoveryAuthSession');
      const auth = getRecoveryAuthSession();
      const envelope = auth?.encryptedIdentity?.recoveryEnvelope;
      if (!envelope) {
        throw new Error(
          'Unlock recovery with your .pn file first so the failsafe envelope can be registered.'
        );
      }

      const { hashRecoveryKey, registerRecoveryFailsafe } = await import('../services/recoveryApiService');
      const keyHash = await hashRecoveryKey(keyData);
      await registerRecoveryFailsafe(apiToken, {
        userPnIdentifier: pnId,
        publicKey,
        envelope,
        keyHash,
      });

      const recoveryKey: RecoveryKey = {
        id: `key-${Date.now()}`,
        identityId: authenticatedUser?.id || selectedDID?.id || 'unknown',
        keyData,
        createdAt: new Date().toISOString(),
        purpose,
        description
      };

      setRecoveryKeys((prev) => [...prev, recoveryKey]);
      setShowRecoveryKeyModal(false);

      const packageJson = {
        version: 1,
        recoveryKey: keyData,
        pnIdentifier: pnId,
        publicKey,
        purpose,
        description,
        createdAt: recoveryKey.createdAt,
        instructions:
          'Store offline. Paste this file or the recoveryKey string on the unlock Recover screen. Starts custodian recovery — does not unlock by itself.',
      };
      const blob = new Blob([JSON.stringify(packageJson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pn-recovery-failsafe-${purpose}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccessWithTimeout(
        'Recovery key registered and downloaded. Store it offline — it will not be shown again.'
      );
      setTimeout(() => setSuccessWithTimeout(null), 6000);
    } catch (error: any) {
      setError(error.message || 'Failed to generate recovery key');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadRecoveryKey = (keyId: string) => {
    const key = recoveryKeys.find(k => k.id === keyId);
    if (!key) return;

    const keyData = {
      recoveryKey: key.keyData,
      identityId: key.identityId,
      purpose: key.purpose,
      description: key.description,
      createdAt: key.createdAt,
      instructions: `
        RECOVERY KEY INSTRUCTIONS:
        
        This recovery key is for triggering the recovery system for your Identity Protocol ID.
        It does NOT unlock your identity directly - it only initiates the recovery process.
        
        To use this key:
        1. Go to the Identity Protocol dashboard
        2. Click "Recover Access"
        3. Enter your recovery key
        4. Your custodians will be notified to approve the recovery
        
        Store this key securely:
        - Keep it in a safe location
        - Consider giving copies to trusted individuals
        - You can provide this to legal entities (will, insurance, etc.)
        
        Purpose: ${key.purpose}
        Description: ${key.description || 'No description provided'}
        Created: ${key.createdAt}
      `
    };

    const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
    a.download = `recovery-key-${key.purpose}-${key.id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    setSuccessWithTimeout('Recovery key downloaded successfully!');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleInitiateRecoveryWithKey = async (
    recoveryKey: string,
    contactInfo: { contactValue: string }
  ) => {
    try {
      setLoading(true);
      setError(null);
      if (!contactInfo.contactValue?.trim()) {
        throw new Error('Callback contact is required');
      }

      const { startRecoveryWithFailsafeKey } = await import('../services/recoveryApiService');
      const started = await startRecoveryWithFailsafeKey({
        recoveryKey,
        threshold: recoveryThreshold,
        claimantContact: contactInfo.contactValue,
      });

      sessionStorage.setItem(
        `pn_recovery_envelope_${started.requestId}`,
        JSON.stringify(started.envelope)
      );

      setRecoveryActiveSession({
        requestId: started.requestId,
        publicKey: started.publicKey,
        pnIdentifier: started.pnIdentifier,
        callbackContact: contactInfo.contactValue.trim(),
        envelope: started.envelope as RecoveryEnvelope,
        threshold: started.threshold,
        approvalCount: 0,
        status: 'pending',
      });

      setRecoveryRequests((prev) => [
        ...prev,
        {
          id: started.requestId,
          requestingDid: started.publicKey,
          requestingUser: contactInfo.contactValue || 'Failsafe key',
          timestamp: new Date().toISOString(),
          status: 'pending',
          approvals: [],
          denials: [],
          signatures: [],
          proofs: [],
          expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
          requiredApprovals: started.threshold,
          currentApprovals: 0,
          oldIdentityHash: started.publicKey,
          claimantContactValue: contactInfo.contactValue,
        },
      ]);
      notifyCustodiansOfRecovery({
        requestId: started.requestId,
        callbackContact: contactInfo.contactValue,
      });
      setShowRecoveryKeyInputModal(false);
      setSuccessWithTimeout(
        started.persisted
          ? 'Recovery started with your failsafe key. Custodians will be notified.'
          : 'Recovery started locally with your failsafe key. Custodians must approve to continue.'
      );
      setTimeout(() => setSuccessWithTimeout(null), 6000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery with key');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCustodian = (custodianId: string) => {
    if (!getRecoveryAuthSession()) {
      setError(recoveryAuthRequiredMessage());
      setTimeout(() => setError(null), 9000);
      return;
    }
    if (!canManageCustodians) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    const vaultRow = recoveryVaultSummary?.custodians.find((c) => c.custodianId === custodianId);
    if (vaultRow?.unrevokable) {
      setError('Protected custodians cannot be revoked. Use an alternative pN you control as a protected anchor.');
      setTimeout(() => setError(null), 9000);
      return;
    }

    if (
      vaultRow
      && vaultRow.status === 'accepted'
      && (recoveryVaultSummary?.counts.acceptedUnrevokable ?? 0) < 1
    ) {
      const proceed = window.confirm(
        'Recovery cannot complete without at least one accepted protected custodian. Add and accept a protected custodian (e.g. your own alt pN) before removing operational custodians. Revoke anyway?'
      );
      if (!proceed) return;
    }

    const removedCustodian = custodians.find(c => c.id === custodianId);
    setCustodians(prev => prev.filter(c => c.id !== custodianId));

    if (removedCustodian && apiToken && recoveryVaultPnId) {
      void revokeRecoveryCustodian(recoveryVaultPnId, apiToken, custodianId, recoveryThreshold)
        .then(() => refreshRecoveryVault())
        .catch((error) => {
          logError('Failed to revoke custodian on vault:', error);
        });
    }

    // Store custodian removal in cloud database for cross-platform sync
    if (removedCustodian) {
      cloudSyncManager.initialize().then(() => {
        return cloudSyncManager.storeUpdate({
          type: 'custodian',
          identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'remove',
            custodianId,
            custodian: removedCustodian
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
      }).then(() => {
        logDebug('Custodian removal stored in cloud database for cross-platform sync');
      }).catch((error) => {
        logError('Failed to store custodian removal in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      });
    }

    setSuccessWithTimeout('Custodian removed successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccessWithTimeout(null), 5000);
  };

  const handleDownloadRecoveredPn = () => {
    if (!recoveredIdentityExport) return;
    if (!canExportIdentity) {
      setError(deviceAuth.deviceRequiredMessage);
      setTimeout(() => setError(null), 9000);
      return;
    }
    const blob = new Blob([JSON.stringify(recoveredIdentityExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recovered-identity.pn';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle recovery completion with automatic license transfer
  const handleRecoveryComplete = async (recovered: { nickname: string }) => {
    try {
      setLoading(true);
      setError(null);

      if (!authenticatedUser?.id) {
        setAuthenticatedUser({
          id: recoveredDID?.id || `recovered-${Date.now()}`,
          nickname: recovered.nickname,
          accessToken: `recovered-token-${Date.now()}`,
          expiresIn: 3600,
          authenticatedAt: new Date().toISOString(),
          publicKey: recoveredDID?.id || ''
        });
      }

      // Create a new primary device for the recovered identity
      const recoveredPrimaryDevice: SyncedDevice = {
        id: `recovered-primary-${Date.now()}`,
        name: `${navigator.platform} - ${navigator.userAgent.split(' ').pop()?.split('/')[0] || 'Unknown'}`,
        type: 'desktop', // Default to desktop, could be enhanced with better detection
        lastSync: new Date().toISOString(),
        status: 'active',
        location: 'Recovered Location',
        ipAddress: 'Recovered IP',
        isPrimary: true, // This becomes the new primary device
        deviceFingerprint: generateDeviceFingerprint(),
        syncKey: generateSyncKey(),
        pairedAt: new Date().toISOString()
      };

      setCurrentDevice(recoveredPrimaryDevice);

      // Update recovery request status
      setRecoveryRequests(prev => prev.map(req =>
        req.requestingDid === (recoveredDID?.id || authenticatedUser?.publicKey)
          ? { ...req, status: 'approved' as const }
          : req
      ));

      // AUTOMATIC LICENSE TRANSFER - Transfer all licenses from old identity to new identity
      try {
        if (!recoveredDID) {
          throw new Error('Recovered identity details are unavailable');
        }
        // Find the old identity hash (from the recovery request)
        const recoveryRequest = recoveryRequests.find(req => req.requestingDid === recoveredDID.id);
        if (recoveryRequest) {
          // Get the old identity hash (in real implementation, this would be extracted from recovery data)
          const oldIdentityHash = recoveryRequest.oldIdentityHash || `old-${recoveredDID.id}`;
          const newIdentityHash = recoveredDID.id;

          // Transfer all licenses automatically
          const transferredLicenses = await LicenseVerification.transferLicense(oldIdentityHash, newIdentityHash);

          if (transferredLicenses) {
            // Update license info in the UI
            setLicenseKey(transferredLicenses.licenseKey);
            setLicenseInfo(transferredLicenses);

            // Generate new ZK proof for the transferred license
            const newLicenseProof = await LicenseVerification.generateLicenseProof(transferredLicenses, {});
            setLicenseProof(newLicenseProof);

            // Store license transfer in cloud database for cross-platform sync
            try {
              await cloudSyncManager.initialize();
              await cloudSyncManager.storeUpdate({
                type: 'license-transfer',
                identityId: recoveredDID.id,
                publicKey: authenticatedUser?.publicKey || '',
                data: {
                  action: 'transfer',
                  oldIdentityHash,
                  newIdentityHash,
                  transferredLicense: transferredLicenses
                },
                updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
              });
              logDebug('License transfer stored in cloud database for cross-platform sync');
            } catch (error) {
              logError('Failed to store license transfer in cloud:', error);
              // Don't fail the entire operation if cloud sync fails
            }

            setSuccessWithTimeout('Identity recovered successfully with automatic license transfer! This device is now your primary device.');
          } else {
            setSuccessWithTimeout('Identity recovered successfully! This device is now your primary device.');
          }
        } else {
          setSuccessWithTimeout('Identity recovered successfully! This device is now your primary device.');
        }
      } catch (licenseError: any) {
        // Log license transfer error but don't fail the recovery
        logError('License transfer failed during recovery:', licenseError);
        setSuccessWithTimeout('Identity recovered successfully! License transfer will be completed separately.');
      }

      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to complete recovery');
    } finally {
      setLoading(false);
    }
  };

  // Handle opening custodian approval modal
  const handleOpenCustodianApprovalModal = (custodianship: {
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    identityPublicKey?: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  }) => {
    const pk = custodianship.identityPublicKey || custodianship.identityId;
    const pendingRequest = recoveryRequests.find(
      (r) => (r.requestingDid === pk || r.requestingDid === custodianship.identityId) && r.status === 'pending'
    );
    if (pendingRequest && custodianship.canApprove) {
      setSelectedRecoveryRequest(pendingRequest);
      setSelectedCustodianship(custodianship);
      setShowCustodianApprovalModal(true);
    }
  };

  // Handle custodian invitation acceptance
  const handleCustodianInvitationAcceptance = async (invitationData: {
    invitationId: string;
    custodianName: string;
    custodianType: 'self-recovery' | 'person' | 'service';
    contactType: 'email' | 'phone';
    contactValue: string;
    identityName: string;
    identityUsername: string;
  }) => {
    try {
      // Check if user is authenticated
      if (!authenticatedUser) {
        setError('You must unlock your identity first to accept custodianship');
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Create new custodianship
      const newCustodianship = {
        id: `custodianship-${Date.now()}`,
        identityId: invitationData.invitationId.split('-')[0], // Extract identity ID from invitation
        identityName: invitationData.identityName,
        identityUsername: invitationData.identityUsername,
        status: 'active' as const,
        canApprove: true
      };

      // Add to custodianships
      setCustodianships(prev => [...prev, newCustodianship]);

      // Update custodian status on the identity owner's side (in real app, this would be a server call)
      // For now, we'll simulate this by updating the local state
      setSuccessWithTimeout(`Custodianship accepted! You are now a custodian for ${invitationData.identityName}`);
      setTimeout(() => setSuccessWithTimeout(null), 5000);

      // Close the invitation modal
      setShowCustodianInvitationModal(false);
      setPendingCustodianInvitation(null);

    } catch (error: any) {
      setError(error.message || 'Failed to accept custodianship');
      setTimeout(() => setError(null), 9000);
    }
  };

  // Handle custodian invitation QR code acceptance
  // Custodian invitation QR code handler (currently unused but available for future use)
  const handleCustodianInvitationQRCode = async (qrData: string) => {
    try {
      // Parse and validate QR code data
      const parsedData = await QRCodeManager.parseQRCode(qrData);

      if (parsedData.type !== 'custodian-invitation') {
        throw new Error('Invalid QR code type - expected custodian invitation');
      }

      const invitationData = parsedData.data;

      // Validate the invitation hasn't expired
      if (invitationData.expiresAt && Date.now() > invitationData.expiresAt) {
        throw new Error('Custodian invitation has expired');
      }

      // Create new custodianship
      const newCustodianship = {
        id: `custodianship-${Date.now()}`,
        identityId: invitationData.invitationId,
        identityName: invitationData.custodianName,
        identityUsername: invitationData.custodianName.split(' ')[0].toLowerCase(),
        status: 'active' as const,
        canApprove: true
      };

      // Add to custodianships list
      setCustodianships(prev => [...prev, newCustodianship]);

      // Update any existing pending custodians to active
      setCustodians(prev => prev.map(custodian =>
        custodian.contactValue === invitationData.contactValue &&
        custodian.contactType === invitationData.contactType
          ? {
              ...custodian,
              status: 'active' as const,
              canApprove: true,
              lastVerified: new Date().toISOString()
            }
          : custodian
      ));

      setSuccessWithTimeout('Custodianship accepted successfully! You can now approve recovery requests for this identity.');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to accept custodian invitation');
      setTimeout(() => setError(null), 9000);
    }
  };

  return {
    handleInitiateRecovery,
    generateCustodianQRCode,
    handleContactAction,
    handleAddCustodian,
    handleCustodianAcceptance,
    handleApproveRecovery,
    handleInitiateRecoveryFromPn,
    handleRecoveryPasscodeSubmit,
    handleContinueReadyRecovery,
    handleResendCustodianNotify,
    handleCancelActiveRecovery,
    handleDenyRecovery,
    handleGenerateRecoveryKey,
    handleDownloadRecoveryKey,
    handleInitiateRecoveryWithKey,
    handleRemoveCustodian,
    handleDownloadRecoveredPn,
    handleRecoveryComplete,
    handleOpenCustodianApprovalModal,
    handleCustodianInvitationAcceptance,
    handleCustodianInvitationQRCode
  };
}
