import React, { lazy, Suspense } from 'react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { DataPointProposalModal } from '../components/DataPointProposalModal';
import { DataPointInputModal } from '../components/DataPointInputModal';
import { IdentityVerificationModal } from '../components/IdentityVerificationModal';
import { DelegationModal } from '../components/DelegationModal';
import { OnboardingWizard } from '../components/OnboardingWizard';
import TransferReceiver from '../pages/TransferReceiver';
import TermsOfService from '../pages/TermsOfService';
import PrivacyPolicy from '../pages/PrivacyPolicy';
import DmcaPolicy from '../pages/DmcaPolicy';
import { ExportAuthModal } from '../components/modals/ExportAuthModal';
import { ExportOptionsModal } from '../components/modals/ExportOptionsModal';
import { ExportToUsbModal } from '../components/modals/ExportToUsbModal';
import { ExportToNfcModal } from '../components/modals/ExportToNfcModal';
import { UnlockFromUsbModal } from '../components/unlock/UnlockFromUsbModal';
import { UnlockFromNfcModal } from '../components/unlock/UnlockFromNfcModal';
import { TransferSetupModal } from '../components/modals/TransferSetupModal';
import { DeviceInfoModal } from '../components/modals/DeviceInfoModal';
import { RecoveryModal } from '../components/modals/RecoveryModal';
import { AddCustodianModal } from '../components/modals/AddCustodianModal';
import { RecoveryKeyGenerationModal } from '../components/modals/RecoveryKeyGenerationModal';
import { RecoveryKeyInputModal } from '../components/modals/RecoveryKeyInputModal';
import { RecoveryCompletionModal } from '../components/modals/RecoveryCompletionModal';
import { CustodianInvitationModal } from '../components/modals/CustodianInvitationModal';
import { CustodianAcceptanceModal } from '../components/modals/CustodianAcceptanceModal';
import { CustodianApprovalModal } from '../components/modals/CustodianApprovalModal';
import { CustodianInvitationAcceptanceModal } from '../components/modals/CustodianInvitationAcceptanceModal';
import { RecoveryKeysModal } from '../components/recovery/RecoveryKeysModal';
import { ownerFetch } from '../services/ownerApiService';
import { SecureCredentialManager } from '@par-noir/identity-crypto';

const EnhancedPrivacyPanel = lazy(() => import('../components/EnhancedPrivacyPanel').then(module => ({ default: module.EnhancedPrivacyPanel })));
const ToolSettingsModal = lazy(() => import('../components/ToolSettingsModal').then(module => ({ default: module.ToolSettingsModal })));
const IntegrationDebugger = lazy(() => import('../components/IntegrationDebugger').then(module => ({ default: module.default })));
const SessionManager = lazy(() => import('../components/SessionManager').then(module => ({ default: module.SessionManager })));
const ProfilePictureEditor = lazy(() => import('../components/ProfilePictureEditor').then(module => ({ default: module.ProfilePictureEditor })));

export interface AppModalsProps {
  showRecoveryModal: any;
  setShowRecoveryModal: any;
  handleInitiateRecoveryWithKey: any;
  handleContinueReadyRecovery: any;
  handleRefreshActiveRecovery: any;
  handleCancelActiveRecovery: any;
  recoveryKeys: any;
  recoveryVaultSummary: any;
  showAddCustodianModal: any;
  setShowAddCustodianModal: any;
  handleAddCustodian: any;
  showRecoveryKeyModal: any;
  setShowRecoveryKeyModal: any;
  recoveryKeyForm: any;
  setRecoveryKeyForm: any;
  handleGenerateRecoveryKey: any;
  showRecoveryKeyInputModal: any;
  setShowRecoveryKeyInputModal: any;
  recoveryKeyInput: any;
  setRecoveryKeyInput: any;
  recoveryKeyContactInfo: any;
  setRecoveryKeyContactInfo: any;
  showCustodianInvitationModal: any;
  setShowCustodianInvitationModal: any;
  pendingCustodianInvitation: any;
  setPendingCustodianInvitation: any;
  handleCustodianInvitationAcceptance: any;
  showSendInvitationModal: any;
  setShowSendInvitationModal: any;
  selectedCustodianForInvitation: any;
  setSelectedCustodianForInvitation: any;
  custodianQRCode: any;
  setCustodianQRCode: any;
  custodianContactInfo: any;
  setCustodianContactInfo: any;
  generateCustodianQRCode: any;
  handleContactAction: any;
  showCustodianAcceptanceModal: any;
  setShowCustodianAcceptanceModal: any;
  pendingCustodianInvitationData: any;
  setPendingCustodianInvitationData: any;
  custodianAcceptanceData: any;
  setCustodianAcceptanceData: any;
  handleCustodianAcceptance: any;
  showCustodianApprovalModal: any;
  setShowCustodianApprovalModal: any;
  selectedRecoveryRequest: any;
  selectedCustodianship: any;
  recoveryThreshold: any;
  handleApproveRecovery: any;
  setSuccessWithTimeout: any;
  showRecoveryKeysModal: any;
  setShowRecoveryKeysModal: any;
  setPendingRecoveryCompletion: any;
  loading: any;
  handleRecoveryKeysSubmit: any;
  showRecoveryCompleteModal: any;
  setShowRecoveryCompleteModal: any;
  recoveredDID: any;
  handleRecoveryComplete: any;
  handleDownloadRecoveredPn: any;
  recoveredIdentityExport: any;
  showEnhancedPrivacyPanel: any;
  setShowEnhancedPrivacyPanel: any;
  privacySettings: any;
  setPrivacySettings: any;
  showToolSettingsModal: any;
  setShowToolSettingsModal: any;
  selectedToolId: any;
  showSessionManager: any;
  setShowSessionManager: any;
  showProfilePictureEditor: any;
  selectedDID: any;
  handleProfilePictureUpdate: any;
  setShowProfilePictureEditor: any;
  showUnlockFromUsbModal: any;
  setShowUnlockFromUsbModal: any;
  handleUnlockFromUsb: any;
  setError: any;
  showUnlockFromNfcModal: any;
  setShowUnlockFromNfcModal: any;
  showDeviceInfoModal: any;
  setShowDeviceInfoModal: any;
  currentDevice: any;
  showOnboardingWizard: any;
  setShowOnboardingWizard: any;
  setIsNewUser: any;
  authenticatedUser: any;
  handleUpdateNickname: any;
  handleExportData: any;
  handleExportToUsb: any;
  handleExportToNfc: any;
  setActiveTab: any;
  showIntegrationDebugger: any;
  setShowIntegrationDebugger: any;
  showExportAuthModal: any;
  setShowExportAuthModal: any;
  setPendingExportAction: any;
  setShowExportOptionsModal: any;
  exportAuthData: any;
  setExportAuthData: any;
  showExportKey1: any;
  setShowExportKey1: any;
  showExportKey2: any;
  setShowExportKey2: any;
  handleExportAuth: any;
  pendingExportAction: any;
  showExportOptionsModal: any;
  handleDownloadExport: any;
  handleExportDeviceBound: any;
  canExportIdentity: any;
  deviceAuth: any;
  handleTransfer: any;
  showExportToUsbModal: any;
  identityForUsbExport: any;
  setShowExportToUsbModal: any;
  setIdentityForUsbExport: any;
  showSuccessMessage: any;
  showExportToNfcModal: any;
  identityForNfcExport: any;
  setShowExportToNfcModal: any;
  setIdentityForNfcExport: any;
  showTransferSetupModal: any;
  setShowTransferSetupModal: any;
  transferCreated: any;
  setTransferCreated: any;
  transferCode: any;
  setTransferCode: any;
  transferUrl: any;
  handleTransferSetup: any;
  success: any;
  showTransferReceiver: any;
  transferId: any;
  setShowTransferReceiver: any;
  showTermsOfService: any;
  showPrivacyPolicy: any;
  showDmcaPolicy: any;
  setShowDmcaPolicy: any;
  showDataPointInputModal: any;
  currentDataPoint: any;
  setShowDataPointInputModal: any;
  currentDataPointExistingData: any;
  handleDataPointInputComplete: any;
  selectedStoredIdentity: any;
  getEncryptedIdentityForApiToken: (
    identityPublicKeyOrId: string | undefined
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;
  showDelegationModal: any;
  setShowDelegationModal: any;
  apiToken: any;
  refreshAssetDelegations: any;
  showDataPointProposalModal: any;
  setShowDataPointProposalModal: any;
  showVerificationModal: any;
  setShowVerificationModal: any;
  attestedDataPoints: any;
  verifiedDataPoints: any;
  setAttestedDataPoints: any;
  setVerifiedDataPoints: any;
  mapDataPointIdToProofType: any;
}

export function AppModals(props: AppModalsProps) {
  const {
    showRecoveryModal,
    setShowRecoveryModal,
    handleInitiateRecoveryWithKey,
    handleContinueReadyRecovery,
    handleRefreshActiveRecovery,
    handleCancelActiveRecovery,
    recoveryKeys,
    recoveryVaultSummary,
    showAddCustodianModal,
    setShowAddCustodianModal,
    handleAddCustodian,
    showRecoveryKeyModal,
    setShowRecoveryKeyModal,
    recoveryKeyForm,
    setRecoveryKeyForm,
    handleGenerateRecoveryKey,
    showRecoveryKeyInputModal,
    setShowRecoveryKeyInputModal,
    recoveryKeyInput,
    setRecoveryKeyInput,
    recoveryKeyContactInfo,
    setRecoveryKeyContactInfo,
    showCustodianInvitationModal,
    setShowCustodianInvitationModal,
    pendingCustodianInvitation,
    setPendingCustodianInvitation,
    handleCustodianInvitationAcceptance,
    showSendInvitationModal,
    setShowSendInvitationModal,
    selectedCustodianForInvitation,
    setSelectedCustodianForInvitation,
    custodianQRCode,
    setCustodianQRCode,
    custodianContactInfo,
    setCustodianContactInfo,
    generateCustodianQRCode,
    handleContactAction,
    showCustodianAcceptanceModal,
    setShowCustodianAcceptanceModal,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    custodianAcceptanceData,
    setCustodianAcceptanceData,
    handleCustodianAcceptance,
    showCustodianApprovalModal,
    setShowCustodianApprovalModal,
    selectedRecoveryRequest,
    selectedCustodianship,
    recoveryThreshold,
    handleApproveRecovery,
    setSuccessWithTimeout,
    showRecoveryKeysModal,
    setShowRecoveryKeysModal,
    setPendingRecoveryCompletion,
    loading,
    handleRecoveryKeysSubmit,
    showRecoveryCompleteModal,
    setShowRecoveryCompleteModal,
    recoveredDID,
    handleRecoveryComplete,
    handleDownloadRecoveredPn,
    recoveredIdentityExport,
    showEnhancedPrivacyPanel,
    setShowEnhancedPrivacyPanel,
    privacySettings,
    setPrivacySettings,
    showToolSettingsModal,
    setShowToolSettingsModal,
    selectedToolId,
    showSessionManager,
    setShowSessionManager,
    showProfilePictureEditor,
    selectedDID,
    handleProfilePictureUpdate,
    setShowProfilePictureEditor,
    showUnlockFromUsbModal,
    setShowUnlockFromUsbModal,
    handleUnlockFromUsb,
    setError,
    showUnlockFromNfcModal,
    setShowUnlockFromNfcModal,
    showDeviceInfoModal,
    setShowDeviceInfoModal,
    currentDevice,
    showOnboardingWizard,
    setShowOnboardingWizard,
    setIsNewUser,
    authenticatedUser,
    handleUpdateNickname,
    handleExportData,
    handleExportToUsb,
    handleExportToNfc,
    setActiveTab,
    showIntegrationDebugger,
    setShowIntegrationDebugger,
    showExportAuthModal,
    setShowExportAuthModal,
    setPendingExportAction,
    setShowExportOptionsModal,
    exportAuthData,
    setExportAuthData,
    showExportKey1,
    setShowExportKey1,
    showExportKey2,
    setShowExportKey2,
    handleExportAuth,
    pendingExportAction,
    showExportOptionsModal,
    handleDownloadExport,
    handleExportDeviceBound,
    canExportIdentity,
    deviceAuth,
    handleTransfer,
    showExportToUsbModal,
    identityForUsbExport,
    setShowExportToUsbModal,
    setIdentityForUsbExport,
    showSuccessMessage,
    showExportToNfcModal,
    identityForNfcExport,
    setShowExportToNfcModal,
    setIdentityForNfcExport,
    showTransferSetupModal,
    setShowTransferSetupModal,
    transferCreated,
    setTransferCreated,
    transferCode,
    setTransferCode,
    transferUrl,
    handleTransferSetup,
    success,
    showTransferReceiver,
    transferId,
    setShowTransferReceiver,
    showTermsOfService,
    showPrivacyPolicy,
    showDmcaPolicy,
    setShowDmcaPolicy,
    showDataPointInputModal,
    currentDataPoint,
    setShowDataPointInputModal,
    currentDataPointExistingData,
    handleDataPointInputComplete,
    selectedStoredIdentity,
    getEncryptedIdentityForApiToken,
    showDelegationModal,
    setShowDelegationModal,
    apiToken,
    refreshAssetDelegations,
    showDataPointProposalModal,
    setShowDataPointProposalModal,
    showVerificationModal,
    setShowVerificationModal,
    attestedDataPoints,
    verifiedDataPoints,
    setAttestedDataPoints,
    setVerifiedDataPoints,
    mapDataPointIdToProofType
  } = props;

  return (
    <>
        {/* Recovery Modal */}
        <RecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          onInitiateRecoveryWithKey={handleInitiateRecoveryWithKey}
          onContinueReadyRecovery={handleContinueReadyRecovery}
          onRefreshActiveRecovery={handleRefreshActiveRecovery}
          onCancelActiveRecovery={handleCancelActiveRecovery}
          continueLoading={loading}
        />

        {/* Add Custodian Modal */}
        <AddCustodianModal
          isOpen={showAddCustodianModal}
          onClose={() => setShowAddCustodianModal(false)}
          onAddCustodian={handleAddCustodian}
        />

        {/* Recovery Key Generation Modal */}
        <RecoveryKeyGenerationModal
          isOpen={showRecoveryKeyModal}
          onClose={() => setShowRecoveryKeyModal(false)}
          recoveryKeyForm={recoveryKeyForm}
          setRecoveryKeyForm={setRecoveryKeyForm}
          onGenerateRecoveryKey={handleGenerateRecoveryKey}
        />





        {/* Recovery Key Input Modal */}
        <RecoveryKeyInputModal
          isOpen={showRecoveryKeyInputModal}
          onClose={() => setShowRecoveryKeyInputModal(false)}
          recoveryKeyInput={recoveryKeyInput}
          setRecoveryKeyInput={setRecoveryKeyInput}
          recoveryKeyContactInfo={recoveryKeyContactInfo}
          setRecoveryKeyContactInfo={setRecoveryKeyContactInfo}
          onInitiateRecoveryWithKey={handleInitiateRecoveryWithKey}
        />

        {/* Custodian Invitation Acceptance Modal */}
        <CustodianInvitationAcceptanceModal
          isOpen={showCustodianInvitationModal}
          onClose={() => {
                    setShowCustodianInvitationModal(false);
                    setPendingCustodianInvitation(null);
                  }}
          pendingCustodianInvitation={pendingCustodianInvitation}
          onAcceptCustodianship={handleCustodianInvitationAcceptance}
        />

        {/* Send Custodian Invitation Modal */}
        <CustodianInvitationModal
          isOpen={showSendInvitationModal}
          onClose={() => setShowSendInvitationModal(false)}
          selectedCustodianForInvitation={selectedCustodianForInvitation}
          setSelectedCustodianForInvitation={setSelectedCustodianForInvitation}
          custodianQRCode={custodianQRCode}
          setCustodianQRCode={setCustodianQRCode}
          custodianContactInfo={custodianContactInfo}
          setCustodianContactInfo={setCustodianContactInfo}
          onGenerateCustodianQRCode={generateCustodianQRCode}
          onContactAction={handleContactAction}
        />

        {/* Custodian Acceptance Modal */}
        <CustodianAcceptanceModal
          isOpen={showCustodianAcceptanceModal}
          onClose={() => setShowCustodianAcceptanceModal(false)}
          pendingCustodianInvitationData={pendingCustodianInvitationData}
          setPendingCustodianInvitationData={setPendingCustodianInvitationData}
          custodianAcceptanceData={custodianAcceptanceData}
          setCustodianAcceptanceData={setCustodianAcceptanceData}
          onCustodianAcceptance={handleCustodianAcceptance}
        />

        {/* Custodian Approval Modal */}
        <CustodianApprovalModal
          isOpen={showCustodianApprovalModal}
          onClose={() => setShowCustodianApprovalModal(false)}
          selectedRecoveryRequest={selectedRecoveryRequest}
          selectedCustodianship={selectedCustodianship}
          recoveryThreshold={recoveryThreshold}
          onApproveRecovery={handleApproveRecovery}
        />

        <RecoveryKeysModal
          isOpen={showRecoveryKeysModal}
          onClose={() => {
            setShowRecoveryKeysModal(false);
            setPendingRecoveryCompletion(null);
          }}
          loading={loading}
          onSubmit={async (newKey1, newKey2) =>
            handleRecoveryKeysSubmit(newKey1, newKey2)
          }
        />

        {/* Recovery Completion Modal */}
        <RecoveryCompletionModal
          isOpen={showRecoveryCompleteModal}
          onClose={() => setShowRecoveryCompleteModal(false)}
          recoveredDID={recoveredDID ? { nickname: recoveredDID.nickname ?? 'Recovered identity' } : null}
          onRecoveryComplete={handleRecoveryComplete}
          onDownloadPn={handleDownloadRecoveredPn}
          hasRecoveredPn={Boolean(recoveredIdentityExport)}
        />

        {/* Enhanced Privacy Panel */}
        {showEnhancedPrivacyPanel && (
          <Suspense fallback={<LoadingSpinner />}>
            <EnhancedPrivacyPanel
              isOpen={showEnhancedPrivacyPanel}
              onClose={() => setShowEnhancedPrivacyPanel(false)}
              settings={privacySettings}
              onSettingsChange={setPrivacySettings}
            />
          </Suspense>
        )}

        {/* Tool Settings Modal */}
        {showToolSettingsModal && (
          <Suspense fallback={<LoadingSpinner />}>
            <ToolSettingsModal
              isOpen={showToolSettingsModal}
              onClose={() => setShowToolSettingsModal(false)}
              toolId={selectedToolId}
              settings={privacySettings}
              onSettingsChange={setPrivacySettings}
            />
          </Suspense>
        )}



        {/* Session Manager Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <SessionManager
            isOpen={showSessionManager}
            onClose={() => setShowSessionManager(false)}
          />
        </Suspense>



        {/* Profile Picture Editor Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <ProfilePictureEditor
            isOpen={showProfilePictureEditor}
            currentPicture={selectedDID?.profilePicture}
            onSave={handleProfilePictureUpdate}
            onCancel={() => setShowProfilePictureEditor(false)}
          />
        </Suspense>

        {/* Unlock from USB Modal */}
        <UnlockFromUsbModal
          isOpen={showUnlockFromUsbModal}
          onClose={() => setShowUnlockFromUsbModal(false)}
          onUnlock={handleUnlockFromUsb}
          onError={(msg) => {
            setError(msg);
            setTimeout(() => setError(null), 9000);
          }}
        />

        {/* Unlock from NFC Modal */}
        <UnlockFromNfcModal
          isOpen={showUnlockFromNfcModal}
          onClose={() => setShowUnlockFromNfcModal(false)}
          onUnlock={handleUnlockFromUsb as (r: import('../components/unlock/UnlockFromNfcModal').UnlockFromNfcResult) => Promise<void>}
          onError={(msg) => {
            setError(msg);
            setTimeout(() => setError(null), 9000);
          }}
        />

        {/* Device Info Modal */}
        <DeviceInfoModal
          isOpen={showDeviceInfoModal}
          onClose={() => setShowDeviceInfoModal(false)}
          currentDevice={currentDevice ?? undefined}
        />



        {/* Onboarding Wizard */}
        <OnboardingWizard
          isOpen={showOnboardingWizard}
          onClose={() => setShowOnboardingWizard(false)}
          onComplete={() => {
            setShowOnboardingWizard(false);
            setIsNewUser(false);
          }}
          currentUser={authenticatedUser}
          onUpdateNickname={handleUpdateNickname}
          onSetupCustodians={() => {
            setShowOnboardingWizard(false);
            setShowAddCustodianModal(true);
          }}
          onExportID={handleExportData}
          onExportToUsb={handleExportToUsb}
          onExportToNfc={handleExportToNfc}
          onExportRecoveryKey={() => {
            setShowOnboardingWizard(false);
            setShowRecoveryKeyModal(true);
          }}
          onNavigateToSection={(section) => {
            setShowOnboardingWizard(false);
            setActiveTab(section as any);
          }}
        />

        {/* Integration Debugger */}
        <Suspense fallback={<LoadingSpinner />}>
          <IntegrationDebugger
            isOpen={showIntegrationDebugger}
            onClose={() => setShowIntegrationDebugger(false)}
          />
        </Suspense>

        {/* Export Authentication Modal */}
        <ExportAuthModal
          isOpen={showExportAuthModal}
          onClose={() => {
            setShowExportAuthModal(false);
            setPendingExportAction(null);
            setShowExportOptionsModal(true);
          }}
          exportAuthData={exportAuthData}
          setExportAuthData={setExportAuthData}
          showExportKey1={showExportKey1}
          setShowExportKey1={setShowExportKey1}
          showExportKey2={showExportKey2}
          setShowExportKey2={setShowExportKey2}
          onAuth={handleExportAuth}
          purpose={
            pendingExportAction === 'download'
              ? 'download'
              : pendingExportAction === 'usb'
                ? 'usb'
                : pendingExportAction === 'nfc'
                  ? 'nfc'
                  : pendingExportAction === 'device-bound'
                    ? 'device-bound'
                    : undefined
          }
        />

        {/* Export Options Modal */}
        <ExportOptionsModal
          isOpen={showExportOptionsModal}
          onClose={() => setShowExportOptionsModal(false)}
          exportAuthData={exportAuthData}
          setExportAuthData={setExportAuthData}
          setShowExportKey1={setShowExportKey1}
          setShowExportKey2={setShowExportKey2}
          onDownloadExport={handleDownloadExport}
          onExportToUsb={handleExportToUsb}
          onExportToNfc={handleExportToNfc}
          onExportDeviceBound={handleExportDeviceBound}
          canExportDeviceBound={canExportIdentity && deviceAuth.isKeyedSession}
          onTransfer={handleTransfer}
        />

        {showExportToUsbModal && identityForUsbExport && (
            <ExportToUsbModal
              isOpen={showExportToUsbModal}
              onClose={() => {
                setShowExportToUsbModal(false);
                setIdentityForUsbExport(null);
              }}
              identityToExport={identityForUsbExport}
              onSuccess={() => {
                setShowExportOptionsModal(false);
                showSuccessMessage('pN exported to USB successfully');
              }}
              onError={(msg) => {
                setError(msg);
                setTimeout(() => setError(null), 9000);
              }}
            />
        )}

        {showExportToNfcModal && identityForNfcExport && (
            <ExportToNfcModal
              isOpen={showExportToNfcModal}
              onClose={() => {
                setShowExportToNfcModal(false);
                setIdentityForNfcExport(null);
              }}
              identityToExport={identityForNfcExport}
              onSuccess={() => {
                setShowExportOptionsModal(false);
                showSuccessMessage('pN exported to NFC card successfully');
              }}
              onError={(msg) => {
                setError(msg);
                setTimeout(() => setError(null), 9000);
              }}
            />
        )}

        {/* Transfer Setup Modal */}
        <TransferSetupModal
          isOpen={showTransferSetupModal}
          onClose={() => setShowTransferSetupModal(false)}
          transferCreated={transferCreated}
          setTransferCreated={setTransferCreated}
          transferCode={transferCode}
          setTransferCode={setTransferCode}
          transferUrl={transferUrl}
          onTransferSetup={handleTransferSetup}
          onCopyUrl={async () => {
                        const { copyToClipboard } = await import('../utils/helpers');
                        const ok = await copyToClipboard(transferUrl);
                        if (ok) {
                          setSuccessWithTimeout('URL copied to clipboard!');
                          setTimeout(() => setSuccessWithTimeout(null), 3000);
                        }
                      }}
          success={success}
        />

        {/* Transfer Receiver */}
        {showTransferReceiver && (
          <TransferReceiver 
            transferId={transferId}
            onClose={() => {
              setShowTransferReceiver(false);
              window.location.href = '/';
            }}
          />
        )}

        {/* Terms of Service */}
        {showTermsOfService && (
          <TermsOfService />
        )}

        {/* Privacy Policy */}
        {showPrivacyPolicy && (
          <PrivacyPolicy />
        )}

        {/* DMCA Policy */}
        {showDmcaPolicy && (
          <DmcaPolicy onClose={() => setShowDmcaPolicy(false)} />
        )}

        {/* Data Collection Modal */}
                      {showDataPointInputModal && currentDataPoint && (
                <DataPointInputModal
                  isOpen={showDataPointInputModal}
                  onClose={() => setShowDataPointInputModal(false)}
                  dataPoint={currentDataPoint}
                  existingData={currentDataPointExistingData}
                  onComplete={handleDataPointInputComplete}
                  identityId={authenticatedUser?.id ?? selectedStoredIdentity?.id}
                  identityPublicKey={
                    authenticatedUser?.publicKey || selectedStoredIdentity?.publicKey
                  }
                  loadEncryptedIdentity={getEncryptedIdentityForApiToken}
                  encryptedIdentity={(() => {
                    // Optional fast path when unlock-list selection still holds nested EncryptedIdentity
                    const nested = selectedStoredIdentity?.encryptedData;
                    if (
                      nested &&
                      typeof nested === 'object' &&
                      typeof nested.encryptedData === 'string' &&
                      nested.iv &&
                      nested.salt
                    ) {
                      return {
                        publicKey: nested.publicKey || selectedStoredIdentity.publicKey,
                        mlKemPublicKey: nested.mlKemPublicKey || selectedStoredIdentity.mlKemPublicKey,
                        encryptedData: nested.encryptedData,
                        iv: nested.iv,
                        salt: nested.salt,
                      };
                    }
                    return undefined;
                  })()}
                />
              )}

        {/* Delegation Modal */}
        <DelegationModal
          isOpen={showDelegationModal}
          onClose={() => setShowDelegationModal(false)}
          accessToken={apiToken}
          rootPnIdentifier={
            authenticatedUser?.id
              ? authenticatedUser.id.startsWith('pn-')
                ? authenticatedUser.id
                : `pn-${authenticatedUser.id}`
              : null
          }
          onDelegationCreated={() => {
            setSuccessWithTimeout('Delegation created successfully!');
            setTimeout(() => setSuccessWithTimeout(null), 3000);
            void refreshAssetDelegations();
          }}
        />

        <DataPointProposalModal
          isOpen={showDataPointProposalModal}
          onClose={() => setShowDataPointProposalModal(false)}
          onProposalSubmitted={() => {
            setShowDataPointProposalModal(false);
            setSuccessWithTimeout('Data point proposal submitted');
            setTimeout(() => setSuccessWithTimeout(null), 3000);
          }}
        />

        {/* Identity Verification Modal */}
      <IdentityVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerificationComplete={async (verifiedData) => {
          const verifiedDataPointIds = Object.keys(verifiedData.dataPoints || {});
          const updatedAttestedDataPoints = new Set(attestedDataPoints);
          const updatedVerifiedDataPoints = new Set(verifiedDataPoints);

          verifiedDataPointIds.forEach((dataPointId) => {
            updatedAttestedDataPoints.delete(dataPointId);
            updatedVerifiedDataPoints.add(dataPointId);
          });

          try {
            const credentials = SecureCredentialManager.getCredentials(authenticatedUser?.id);
            const authToken = apiToken;
            if (credentials && authToken && authenticatedUser?.id) {
              const identityKey = authenticatedUser.publicKey || authenticatedUser.id;
              let encryptedIdentity = await getEncryptedIdentityForApiToken?.(identityKey);
              if (
                !encryptedIdentity &&
                authenticatedUser.publicKey &&
                authenticatedUser.publicKey !== authenticatedUser.id
              ) {
                encryptedIdentity = await getEncryptedIdentityForApiToken?.(authenticatedUser.id);
              }
              if (encryptedIdentity) {
                const { mintDerivedNameZkps, mintDerivedAgeZkps } = await import(
                  '../utils/mintDerivedZkps'
                );
                const { IdentityCrypto } = await import('@par-noir/identity-crypto');
                const extracted = (verifiedData as { extracted?: Record<string, string> }).extracted || {};
                const firstName =
                  extracted.firstName ||
                  (verifiedData.dataPoints?.first_name as { value?: { firstName?: string } })?.value
                    ?.firstName ||
                  '';
                const lastName =
                  extracted.lastName ||
                  (verifiedData.dataPoints?.last_name as { value?: { lastName?: string } })?.value
                    ?.lastName ||
                  '';
                const middleName = extracted.middleName || '';
                const dateOfBirth =
                  extracted.dateOfBirth ||
                  (verifiedData.dataPoints?.age_attestation as { value?: { dateOfBirth?: string } })
                    ?.value?.dateOfBirth ||
                  '';

                const fullIdentity = {
                  publicKey:
                    (encryptedIdentity as { publicKey?: string }).publicKey ||
                    authenticatedUser.publicKey ||
                    identityKey,
                  encryptedData: encryptedIdentity.encryptedData,
                  iv: encryptedIdentity.iv,
                  salt: encryptedIdentity.salt,
                  mlKemPublicKey: (encryptedIdentity as { mlKemPublicKey?: string }).mlKemPublicKey
                };

                const mintParams = {
                  identityId: authenticatedUser.id,
                  credentials,
                  authToken,
                  publicKey: authenticatedUser.publicKey,
                  encryptedIdentity: fullIdentity,
                  verificationLevel: 'verified' as const,
                  encryptedUserData: undefined as string | undefined
                };

                if (firstName && lastName) {
                  const nameFields = {
                    firstName,
                    lastName,
                    middleName,
                    prefix: extracted.prefix,
                    suffix: extracted.suffix
                  };
                  const enc = await IdentityCrypto.encryptData(
                    JSON.stringify(nameFields),
                    credentials.key1,
                    credentials.key2
                  );
                  mintParams.encryptedUserData = JSON.stringify(enc);
                  const ids = await mintDerivedNameZkps(nameFields, mintParams);
                  ids.forEach((id) => {
                    updatedVerifiedDataPoints.add(id);
                    updatedAttestedDataPoints.add(id);
                  });
                }
                if (dateOfBirth) {
                  const enc = await IdentityCrypto.encryptData(
                    JSON.stringify({ dateOfBirth }),
                    credentials.key1,
                    credentials.key2
                  );
                  mintParams.encryptedUserData = JSON.stringify(enc);
                  const ids = await mintDerivedAgeZkps(dateOfBirth, mintParams);
                  ids.forEach((id) => {
                    updatedVerifiedDataPoints.add(id);
                    updatedAttestedDataPoints.add(id);
                  });
                }

                // Document metadata rows (verified)
                const { ZKPDataPointsService } = await import('../utils/zkpDataPointsService');
                for (const [dataPointId, dataPoint] of Object.entries(verifiedData.dataPoints || {})) {
                  if (
                    dataPointId === 'document_type' ||
                    dataPointId === 'document_number' ||
                    dataPointId === 'document_verification'
                  ) {
                    const zkpDataPoint = {
                      dataPointId,
                      proofType: mapDataPointIdToProofType(dataPointId),
                      zkpProof: (dataPoint as { zkpProof?: string }).zkpProof || '',
                      signature: (dataPoint as { zkpProof?: string }).zkpProof || '',
                      verifiedAt:
                        (dataPoint as { verifiedAt?: string }).verifiedAt || verifiedData.verifiedAt,
                      expiresAt: (dataPoint as { expiresAt?: string }).expiresAt,
                      verificationLevel: 'verified' as const,
                      metadata: {
                        provider: verifiedData.provider || 'veriff',
                        fraudPreventionScore: verifiedData.fraudPrevention?.riskScore
                      }
                    };
                    if (zkpDataPoint.zkpProof) {
                      await ZKPDataPointsService.saveDataPoint(
                        authenticatedUser.id,
                        credentials,
                        authToken,
                        zkpDataPoint,
                        authenticatedUser.publicKey
                      );
                      updatedVerifiedDataPoints.add(dataPointId);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error minting verified ZKPs after Veriff:', error);
          }

          setAttestedDataPoints(updatedAttestedDataPoints);
          setVerifiedDataPoints(updatedVerifiedDataPoints);
          setShowVerificationModal(false);
        }}
        identityId={authenticatedUser?.id ?? selectedStoredIdentity?.id ?? 'default'}
        encryptedIdentity={
          selectedStoredIdentity?.encryptedData &&
          selectedStoredIdentity?.publicKey &&
          selectedStoredIdentity?.iv &&
          selectedStoredIdentity?.salt
            ? {
                publicKey: selectedStoredIdentity.publicKey,
                mlKemPublicKey: selectedStoredIdentity.mlKemPublicKey,
                encryptedData: selectedStoredIdentity.encryptedData,
                iv: selectedStoredIdentity.iv,
                salt: selectedStoredIdentity.salt,
              }
            : undefined
        }
      />

    </>
  );
}
