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
import { RecoveryPasscodeModal } from '../components/recovery/RecoveryPasscodeModal';
import { BiometricPasscodeModal } from '../components/security/BiometricPasscodeModal';
import { API_ENDPOINT } from '../config/api';

const EnhancedPrivacyPanel = lazy(() => import('../components/EnhancedPrivacyPanel').then(module => ({ default: module.EnhancedPrivacyPanel })));
const ToolSettingsModal = lazy(() => import('../components/ToolSettingsModal').then(module => ({ default: module.ToolSettingsModal })));
const IntegrationSettingsManager = lazy(() => import('../components/IntegrationSettingsManager').then(module => ({ default: module.default })));
const IntegrationDebugger = lazy(() => import('../components/IntegrationDebugger').then(module => ({ default: module.default })));
const SessionManager = lazy(() => import('../components/SessionManager').then(module => ({ default: module.SessionManager })));
const MigrationModal = lazy(() => import('../components/MigrationModal').then(module => ({ default: module.MigrationModal })));
const ProfilePictureEditor = lazy(() => import('../components/ProfilePictureEditor').then(module => ({ default: module.ProfilePictureEditor })));

export interface AppModalsProps {
  showMigrationModal: any;
  setShowMigrationModal: any;
  pendingMigrations: any;
  handleMigrationComplete: any;
  showRecoveryModal: any;
  setShowRecoveryModal: any;
  activeRecoveryMethod: any;
  setActiveRecoveryMethod: any;
  handleInitiateRecoveryFromPn: any;
  handleInitiateRecoveryWithKey: any;
  recoveryKeys: any;
  recoveryVaultSummary: any;
  showAddCustodianModal: any;
  setShowAddCustodianModal: any;
  showCustodianInfo: any;
  setShowCustodianInfo: any;
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
  showRecoveryPasscodeModal: any;
  setShowRecoveryPasscodeModal: any;
  setPendingRecoveryCompletion: any;
  loading: any;
  handleRecoveryPasscodeSubmit: any;
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
  showIntegrationSettings: any;
  setShowIntegrationSettings: any;
  showIntegrationDebugger: any;
  setShowIntegrationDebugger: any;
  showExportAuthModal: any;
  setShowExportAuthModal: any;
  setPendingExportAction: any;
  setShowExportOptionsModal: any;
  exportAuthData: any;
  setExportAuthData: any;
  showExportPnName: any;
  setShowExportPnName: any;
  showExportPasscode: any;
  setShowExportPasscode: any;
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
  transferPasscode: any;
  setTransferPasscode: any;
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
  showBiometricPasscodeModal: any;
  pendingBiometricIdentity: any;
  setShowBiometricPasscodeModal: any;
  setPendingBiometricIdentity: any;
  setBiometricPasscodeError: any;
  handleBiometricPasscodeSubmit: any;
  biometricPasscodeError: any;
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
    showMigrationModal,
    setShowMigrationModal,
    pendingMigrations,
    handleMigrationComplete,
    showRecoveryModal,
    setShowRecoveryModal,
    activeRecoveryMethod,
    setActiveRecoveryMethod,
    handleInitiateRecoveryFromPn,
    handleInitiateRecoveryWithKey,
    recoveryKeys,
    recoveryVaultSummary,
    showAddCustodianModal,
    setShowAddCustodianModal,
    showCustodianInfo,
    setShowCustodianInfo,
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
    showRecoveryPasscodeModal,
    setShowRecoveryPasscodeModal,
    setPendingRecoveryCompletion,
    loading,
    handleRecoveryPasscodeSubmit,
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
    showIntegrationSettings,
    setShowIntegrationSettings,
    showIntegrationDebugger,
    setShowIntegrationDebugger,
    showExportAuthModal,
    setShowExportAuthModal,
    setPendingExportAction,
    setShowExportOptionsModal,
    exportAuthData,
    setExportAuthData,
    showExportPnName,
    setShowExportPnName,
    showExportPasscode,
    setShowExportPasscode,
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
    transferPasscode,
    setTransferPasscode,
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
    showBiometricPasscodeModal,
    pendingBiometricIdentity,
    setShowBiometricPasscodeModal,
    setPendingBiometricIdentity,
    setBiometricPasscodeError,
    handleBiometricPasscodeSubmit,
    biometricPasscodeError,
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
        {/* PWA identity migration */}
        {showMigrationModal && (
          <Suspense fallback={<LoadingSpinner />}>
            <MigrationModal
              isOpen={showMigrationModal}
              onClose={() => setShowMigrationModal(false)}
              pendingIdentities={pendingMigrations}
              onMigrationComplete={handleMigrationComplete}
            />
          </Suspense>
        )}

        {/* Recovery Modal */}
        <RecoveryModal
          isOpen={showRecoveryModal}
          onClose={() => setShowRecoveryModal(false)}
          activeRecoveryMethod={activeRecoveryMethod}
          setActiveRecoveryMethod={setActiveRecoveryMethod}
          onInitiateRecoveryFromPn={handleInitiateRecoveryFromPn}
          onInitiateRecoveryWithKey={handleInitiateRecoveryWithKey}
          hasLegacyRecoveryKey={recoveryKeys.length > 0}
          recoveryBlocked={
            !!recoveryVaultSummary &&
            (recoveryVaultSummary.counts.acceptedUnrevokable ?? 0) < 1 &&
            (recoveryVaultSummary.counts.accepted ?? 0) > 0
          }
          recoveryBlockedMessage="Recovery requires at least one accepted protected custodian on the identity being recovered."
        />

        {/* Add Custodian Modal */}
        <AddCustodianModal
          isOpen={showAddCustodianModal}
          onClose={() => setShowAddCustodianModal(false)}
          showCustodianInfo={showCustodianInfo}
          setShowCustodianInfo={setShowCustodianInfo}
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
          onSuccess={(message) => {
            setSuccessWithTimeout(message);
                      setTimeout(() => setSuccessWithTimeout(null), 5000);
                    }}
        />

        <RecoveryPasscodeModal
          isOpen={showRecoveryPasscodeModal}
          onClose={() => {
            setShowRecoveryPasscodeModal(false);
            setPendingRecoveryCompletion(null);
          }}
          loading={loading}
          onSubmit={async (newPasscode) => handleRecoveryPasscodeSubmit(newPasscode)}
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

        {/* Integration Settings Manager */}
        <Suspense fallback={<LoadingSpinner />}>
          <IntegrationSettingsManager
            isOpen={showIntegrationSettings}
            onClose={() => setShowIntegrationSettings(false)}
          />
        </Suspense>

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
          showExportPnName={showExportPnName}
          setShowExportPnName={setShowExportPnName}
          showExportPasscode={showExportPasscode}
          setShowExportPasscode={setShowExportPasscode}
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
          setShowExportPnName={setShowExportPnName}
          setShowExportPasscode={setShowExportPasscode}
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
          transferPasscode={transferPasscode}
          setTransferPasscode={setTransferPasscode}
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
              )}

        {/* Biometric Passcode Modal */}
        {showBiometricPasscodeModal && pendingBiometricIdentity && (
          <BiometricPasscodeModal
            isOpen={showBiometricPasscodeModal}
            onClose={() => {
              setShowBiometricPasscodeModal(false);
              setPendingBiometricIdentity(null);
              setBiometricPasscodeError(null);
            }}
            onSubmit={handleBiometricPasscodeSubmit}
            identityName={pendingBiometricIdentity.nickname || pendingBiometricIdentity.pnName}
            error={biometricPasscodeError}
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
          // Remove existing attested data points that will be replaced by verified data
          const verifiedDataPointIds = Object.keys(verifiedData.dataPoints);
          const updatedAttestedDataPoints = new Set(attestedDataPoints);
          const updatedVerifiedDataPoints = new Set(verifiedDataPoints);
          
          // Remove any existing attested data points that match verified data points
          verifiedDataPointIds.forEach(dataPointId => {
            updatedAttestedDataPoints.delete(dataPointId);
            // Add to verified data points
            updatedVerifiedDataPoints.add(dataPointId);
          });
          
          // Update both states
          setAttestedDataPoints(updatedAttestedDataPoints);
          setVerifiedDataPoints(updatedVerifiedDataPoints);
          setShowVerificationModal(false);
          
          console.log('Verification completed:', verifiedData);
          console.log('Updated attested data points:', Array.from(updatedAttestedDataPoints));
          console.log('Updated verified data points:', Array.from(updatedVerifiedDataPoints));

          // Sync ZKP data points to API server (Google Drive)
          if (authenticatedUser?.id) {
            try {
              // Get pnIdentifier - check if it's already in pn- format, otherwise construct it
              const pnIdentifier = authenticatedUser.id.startsWith('pn-') 
                ? authenticatedUser.id 
                : `pn-${authenticatedUser.id.replace(/^pn-/, '')}`;

              // Get access token - the dashboard might need to use OAuth service
              // For now, try to get from authenticatedUser, but this might need OAuth integration
              const authToken = authenticatedUser.accessToken || authenticatedUser.authToken;
              
              if (!authToken) {
                console.warn('No access token available to sync ZKP data points. ZKP data will be stored locally only.');
                return;
              }

              // Sync each ZKP data point to the API
              for (const [dataPointId, dataPoint] of Object.entries(verifiedData.dataPoints)) {
                try {
                  // Convert dashboard format to API format
                  const zkpDataPoint = {
                    dataPointId: dataPoint.dataPointId || dataPointId,
                    proofType: mapDataPointIdToProofType(dataPointId),
                    zkpProof: dataPoint.zkpProof,
                    signature: dataPoint.zkpProof, // Use proof as signature if no separate signature
                    verifiedAt: dataPoint.verifiedAt || verifiedData.verifiedAt,
                    expiresAt: dataPoint.expiresAt,
                    verificationLevel: dataPoint.verificationLevel || verifiedData.verificationLevel,
                    metadata: {
                      provider: verifiedData.provider || 'veriff',
                      fraudPreventionScore: verifiedData.fraudPrevention?.riskScore
                    }
                  };

                  const response = await fetch(
                    `${API_ENDPOINT}/api/users/${pnIdentifier}/zkp-data-points/${dataPointId}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authToken}`
                      },
                      body: JSON.stringify(zkpDataPoint)
                    }
                  );

                  if (response.ok) {
                    console.log(`✅ Synced ZKP data point ${dataPointId} to API`);
                  } else {
                    console.warn(`⚠️ Failed to sync ZKP data point ${dataPointId}:`, response.status);
                  }
                } catch (error) {
                  console.error(`Error syncing ZKP data point ${dataPointId}:`, error);
                }
              }
            } catch (error) {
              console.error('Error syncing ZKP data points to API:', error);
            }
          }
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
