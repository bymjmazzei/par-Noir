import { cryptoWorkerManager } from "../../utils/cryptoWorkerManager";
import { useCallback } from 'react';
import { RecoveryRequest, RecoveryData, CustodianInvitationForm, CustodianInvitationData, DeepLinkData } from '../types/app';
import { IdentityCrypto } from "../../utils/crypto";
import { SecureStorage } from "../../utils/storage";
import { SecureRandom } from "../../utils/secureRandom";
import QRCode from 'qrcode';

export const useRecoveryCustodianManager = (
  setRecoveryRequests: React.Dispatch<React.SetStateAction<RecoveryRequest[]>>,
  setShowRecoveryModal: (show: boolean) => void,
  setSuccess: (success: string | null) => void,
  setError: (error: string | null) => void,
  setShowCustodianModal: (show: boolean) => void,
  setCustodianQRCode: (qrCode: string) => void,
  setCustodianContactInfo: (info: CustodianInvitationForm | null) => void,
  recoveryThreshold: number
) => {
  // Handle recovery initiation
  const handleRecoveryInitiation = useCallback(async (recoveryData: RecoveryData) => {
    try {
      const storage = new SecureStorage();
      await storage.init();
      
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
      setSuccess('Recovery request initiated! Notifying custodians...');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery');
      setTimeout(() => setError(null), 5000);
    }
  }, [setRecoveryRequests, setShowRecoveryModal, setSuccess, setError, recoveryThreshold]);

  // Generate custodian QR code
  const generateCustodianQRCode = useCallback(async (custodianData: CustodianInvitationForm) => {
    try {
      const invitationData: CustodianInvitationData = {
        invitationId: `inv-${Date.now()}`,
        invitationCode: SecureRandom.generateInvitationCode(),
        custodianName: custodianData.name,
        custodianType: custodianData.type === 'self' ? 'self-recovery' : custodianData.type,
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        identityName: 'Unknown Identity', // This would come from the authenticated user
        identityUsername: 'unknown'
      };
      
      // Create deep link for custodian invitation
      const deepLinkData: DeepLinkData = {
        invitationId: invitationData.invitationId,
        custodianName: invitationData.custodianName,
        custodianType: invitationData.custodianType,
        contactType: invitationData.contactType,
        contactValue: invitationData.contactValue,
        identityName: invitationData.identityName,
        identityUsername: invitationData.identityUsername
      };
      
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
      setError('Failed to generate custodian QR code');
      setTimeout(() => setError(null), 5000);
    }
  }, [setCustodianQRCode, setCustodianContactInfo, setError]);

  // Handle custodian invitation submission
  const handleCustodianInvitation = useCallback(async (custodianData: CustodianInvitationForm) => {
    try {
      // Validate custodian data
      if (!custodianData.name || !custodianData.contactValue || !custodianData.passcode) {
        throw new Error('Please fill in all required fields.');
      }

      if (custodianData.passcode.length < 6) {
        throw new Error('Custodian passcode must be at least 6 characters.');
      }

      // Generate QR code for the custodian
      await generateCustodianQRCode(custodianData);
      
      // Show the modal with QR code
      setShowCustodianModal(true);
      
    } catch (error: any) {
      setError(error.message || 'Failed to create custodian invitation');
      setTimeout(() => setError(null), 5000);
    }
  }, [generateCustodianQRCode, setShowCustodianModal, setError]);

  return {
    handleRecoveryInitiation,
    generateCustodianQRCode,
    handleCustodianInvitation,
  };
};
