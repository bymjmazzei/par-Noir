import React from 'react';
import { CheckCircle, Smartphone, Edit3, Settings, ChevronDown, Users, Layers, Wallet, Lock } from 'lucide-react';
import { STANDARD_DATA_POINTS } from '../types/standardDataPoints';
import { DataPointRequestsPanel } from '../components/DataPointRequestsPanel';
import { RecoveryTab } from '../components/recovery/RecoveryTab';
import { ThemeAwareProfileImage } from '../components/ThemeAwareProfileImage';
import { DeveloperPortal } from '../pages/DeveloperPortal';
import { MonetizationTab } from '../components/monetization/MonetizationTab';
import { SubPnTab } from '../components/subpn/SubPnTab';
import { isIdentityVerificationAvailable } from '../config/verification';
import { FileStorageAggregator } from '../components/storage/FileStorageAggregator';

export interface AuthenticatedShellProps {
  authenticatedUser: any;
  selectedDID: any;
  showNicknameEditor: any;
  editingNickname: any;
  loading: any;
  canExportIdentity: any;
  activeTab: any;
  canProfileRead: any;
  deviceAuth: any;
  apiToken: any;
  verifiedDataPoints: any;
  attestedDataPoints: any;
  globalSettingsExpanded: any;
  thirdPartyExpanded: any;
  privacySettings: any;
  recoveryVaultPnId: any;
  canRotateIdentity: any;
  canCustodiansRead: any;
  recoveryVaultSummary: any;
  vaultRecoveryReady: any;
  recoveryThreshold: any;
  recoveryMutationAllowed: any;
  canManageCustodians: any;
  custodians: any;
  recoveryKeys: any;
  custodianships: any;
  recoveryRequests: any;
  showRecoveryInfo: any;
  canDriveRead: any;
  canDriveUpload: any;
  canProfileWrite: any;
  connectError: any;
  subPnAvailableScopes: any;
  delegationsLoading: any;
  delegationsError: any;
  assetDelegations: any;
  setShowProfilePictureEditor: any;
  setEditingNickname: any;
  setShowNicknameEditor: any;
  setShowOnboardingWizard: any;
  setActiveTab: any;
  setShowVerificationModal: any;
  setShowEnhancedPrivacyPanel: any;
  setShowSessionManager: any;
  setShowIntegrationSettings: any;
  setShowIntegrationDebugger: any;
  setShowDataPointProposalModal: any;
  setGlobalSettingsExpanded: any;
  setThirdPartyExpanded: any;
  setRecoveryThreshold: any;
  setError: any;
  setShowAddCustodianModal: any;
  setSelectedCustodianForInvitation: any;
  setShowSendInvitationModal: any;
  setShowRecoveryKeyModal: any;
  setSelectedCustodianship: any;
  setSelectedRecoveryRequest: any;
  setShowCustodianApprovalModal: any;
  setRecoveryRequests: any;
  setShowRecoveryInfo: any;
  setShowDelegationModal: any;
  handleNicknameUpdate: any;
  handleExportData: any;
  handleLogout: any;
  handleRequestDataPoint: any;
  handleToggleToolDataPoint: any;
  handleOpenToolSettings: any;
  bumpRecoveryAuthUi: any;
  refreshRecoveryVault: any;
  handleRemoveCustodian: any;
  handleDownloadRecoveryKey: any;
  handleOpenCustodianApprovalModal: any;
  ensureOwnerApiTokenForActiveUser: any;
  showErrorMessage: any;
  showSuccessMessage: any;
  refreshAssetDelegations: any;
  handleRemoveDelegation: any;
}

export function AuthenticatedShell(props: AuthenticatedShellProps) {
  const {
    authenticatedUser,
    selectedDID,
    showNicknameEditor,
    editingNickname,
    loading,
    canExportIdentity,
    activeTab,
    canProfileRead,
    deviceAuth,
    apiToken,
    verifiedDataPoints,
    attestedDataPoints,
    globalSettingsExpanded,
    thirdPartyExpanded,
    privacySettings,
    recoveryVaultPnId,
    canRotateIdentity,
    canCustodiansRead,
    recoveryVaultSummary,
    vaultRecoveryReady,
    recoveryThreshold,
    recoveryMutationAllowed,
    canManageCustodians,
    custodians,
    recoveryKeys,
    custodianships,
    recoveryRequests,
    showRecoveryInfo,
    canDriveRead,
    canDriveUpload,
    canProfileWrite,
    connectError,
    subPnAvailableScopes,
    delegationsLoading,
    delegationsError,
    assetDelegations,
    setShowProfilePictureEditor,
    setEditingNickname,
    setShowNicknameEditor,
    setShowOnboardingWizard,
    setActiveTab,
    setShowVerificationModal,
    setShowEnhancedPrivacyPanel,
    setShowSessionManager,
    setShowIntegrationSettings,
    setShowIntegrationDebugger,
    setShowDataPointProposalModal,
    setGlobalSettingsExpanded,
    setThirdPartyExpanded,
    setRecoveryThreshold,
    setError,
    setShowAddCustodianModal,
    setSelectedCustodianForInvitation,
    setShowSendInvitationModal,
    setShowRecoveryKeyModal,
    setSelectedCustodianship,
    setSelectedRecoveryRequest,
    setShowCustodianApprovalModal,
    setRecoveryRequests,
    setShowRecoveryInfo,
    setShowDelegationModal,
    handleNicknameUpdate,
    handleExportData,
    handleLogout,
    handleRequestDataPoint,
    handleToggleToolDataPoint,
    handleOpenToolSettings,
    bumpRecoveryAuthUi,
    refreshRecoveryVault,
    handleRemoveCustodian,
    handleDownloadRecoveryKey,
    handleOpenCustodianApprovalModal,
    ensureOwnerApiTokenForActiveUser,
    showErrorMessage,
    showSuccessMessage,
    refreshAssetDelegations,
    handleRemoveDelegation
  } = props;

  return (
    <>
        {authenticatedUser && (
          <div
            className="max-w-6xl mx-auto text-text-primary px-4 sm:px-6 lg:px-8"
            style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}
          >
            
            {/* Authenticated Dashboard */}
            <div className="flex flex-col items-center gap-8 -mt-4 relative z-10">
              {/* User Profile */}
              <div className="bg-modal-bg rounded-lg shadow p-8 text-text-primary w-full max-w-2xl">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-center gap-4">
                  {/* Profile Picture and Nickname */}
                  <div className="flex items-center justify-center space-x-4">
                  <div className="relative group">
                    {selectedDID?.profilePicture ? (
                      <img
                        src={selectedDID.profilePicture}
                        alt={`${authenticatedUser.nickname || 'User'} profile`}
                        className="w-16 h-16 rounded-full object-cover border-2 border-border"
                        onError={(e) => {
                          // Fallback to theme-aware default if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-16 h-16 rounded-full border-2 border-border relative overflow-hidden ${
                        selectedDID?.profilePicture ? 'hidden' : ''
                      }`}
                      style={{ display: selectedDID?.profilePicture ? 'none' : 'flex' }}
                    >
                                        <ThemeAwareProfileImage
                    className="w-full h-full object-cover"
                  />
                      {/* Edit Profile Picture Button for Default Avatar */}
                      <button
                        onClick={() => setShowProfilePictureEditor(true)}
                        className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-bg-primary rounded-full flex items-center justify-center hover:bg-hover transition-colors shadow-lg hover:shadow-xl"
                        title="Edit profile picture"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Edit Profile Picture Button */}
                    <button
                      onClick={() => setShowProfilePictureEditor(true)}
                      className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary text-bg-primary rounded-full flex items-center justify-center hover:bg-hover transition-colors shadow-lg hover:shadow-xl"
                      title="Edit profile picture"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                    <div>
                      <div className="flex items-center space-x-2 group">
                        {!showNicknameEditor ? (
                          <>
                            <h3 className="text-xl font-semibold text-text-primary">{authenticatedUser.nickname || 'User'}</h3>
                            <button
                              onClick={() => {
                                setEditingNickname(authenticatedUser.nickname || '');
                                setShowNicknameEditor(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-primary transition-all duration-200"
                              title="Edit nickname"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingNickname}
                              onChange={(e) => setEditingNickname(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleNicknameUpdate(editingNickname);
                                } else if (e.key === 'Escape') {
                                  setShowNicknameEditor(false);
                                  setEditingNickname('');
                                }
                              }}
                              className="text-xl font-semibold bg-transparent border-b-2 border-primary text-text-primary focus:outline-none focus:border-primary-dark"
                              placeholder="Enter nickname"
                              autoFocus
                              disabled={loading}
                            />
                            <button
                              onClick={() => handleNicknameUpdate(editingNickname)}
                              disabled={loading || !editingNickname.trim()}
                              className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                              title="Save nickname"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              onClick={() => {
                                setShowNicknameEditor(false);
                                setEditingNickname('');
                              }}
                              disabled={loading}
                              className="p-1 text-gray-600 hover:text-gray-700 disabled:opacity-50"
                              title="Cancel"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button 
                      onClick={() => setShowOnboardingWizard(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors text-sm"
                      title="Show onboarding wizard"
                    >
                      Help
                    </button>
                    {canExportIdentity && (
                    <button 
                      onClick={handleExportData}
                      className="px-3 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors text-sm"
                      title="Export encrypted backup"
                    >
                      Export
                    </button>
                    )}
                    <button 
                      onClick={handleLogout}
                      className="px-4 py-2 modal-button rounded-md font-medium"
                    >
                      Lock
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabbed Interface */}
              <div className="bg-modal-bg rounded-lg shadow p-4 sm:p-6 lg:p-8 text-text-primary w-full max-w-4xl min-w-0">
                {/* Tab Navigation - scrollable on narrow viewports; Sub-pN is 3rd tab */}
                <div className="border-b border-border mb-4 sm:mb-6 relative">
                  <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto overflow-y-hidden px-1 sm:px-4 justify-start lg:justify-center [scrollbar-width:thin]">
                <button
                      onClick={() => setActiveTab('privacy')}
                      className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 ${
                        activeTab === 'privacy'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Privacy & Sharing
                </button>

                      <button
                        onClick={() => setActiveTab('subpn')}
                        className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 flex items-center gap-1 ${
                          activeTab === 'subpn'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                        }`}
                      >
                        <Layers className="w-4 h-4" />
                        Sub-pN
                      </button>

                      <button
                        onClick={() => setActiveTab('delegation')}
                        className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 ${
                          activeTab === 'delegation'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                        }`}
                      >
                        Delegation
                      </button>

                    <button
                      onClick={() => setActiveTab('recovery')}
                      className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 ${
                        activeTab === 'recovery'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Recovery Tool
                    </button>

                    <button
                      onClick={() => setActiveTab('storage')}
                      className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 ${
                        activeTab === 'storage'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Storage
                    </button>

                      <button
                        onClick={() => setActiveTab('developer')}
                      className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 ${
                          activeTab === 'developer'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                        }`}
                      >
                        Services
                      </button>

                      <button
                        onClick={() => setActiveTab('monetization')}
                        className={`py-2 px-2 sm:px-4 border-b-2 font-medium text-sm whitespace-nowrap min-w-0 flex-shrink-0 flex items-center gap-1 ${
                          activeTab === 'monetization'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                        }`}
                      >
                        <Wallet className="w-4 h-4" />
                        Monetization
                      </button>

                  </nav>
              </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                  {activeTab === 'privacy' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Privacy & Sharing Settings</h3>

                        {!canProfileRead ? (
                          <div className="bg-secondary rounded-lg p-6 flex items-start gap-3">
                            <Lock className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
                            <p className="text-sm text-text-secondary">{deviceAuth.deviceRequiredMessage}</p>
                          </div>
                        ) : (
                          <>
                        {authenticatedUser && (
                          <DataPointRequestsPanel
                            authenticatedUser={authenticatedUser}
                            apiToken={apiToken}
                            onResponded={() => {
                              /* permissions refresh on next load */
                            }}
                          />
                        )}
                        
                        {/* Age Verification Section */}
                        <div className="bg-secondary rounded-lg p-6 mb-6">
                          <h4 className="font-medium text-text-primary mb-2">Age Verification</h4>
                          <p className="text-sm text-text-secondary mb-4">
                            Verify your age to create ZKPs for age-restricted content access. Your age data point is used to generate proofs that you are over 18 or over 21 without revealing your actual date of birth.
                          </p>
                          {(verifiedDataPoints.has('age_attestation') || attestedDataPoints.has('age_attestation')) ? (
                            <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-600 rounded-lg">
                              <CheckCircle className="w-5 h-5 text-green-400" />
                              <span className="text-text-primary">Age verified - You can share age ZKP with apps</span>
                            </div>
                          ) : isIdentityVerificationAvailable() ? (
                            <button
                              onClick={() => setShowVerificationModal(true)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                            >
                              Verify Age (Create Age ZKP)
                            </button>
                          ) : (
                            <p className="text-sm text-text-secondary p-3 bg-modal-bg border border-border rounded-lg">
                              Identity verification (Veriff) is not enabled yet. Use manual age attestation via Add below, or check back when verification is live.
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 mb-6">
                          <button
                            type="button"
                            onClick={() => setShowEnhancedPrivacyPanel(true)}
                            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-hover text-text-primary"
                          >
                            Advanced privacy
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSessionManager(true)}
                            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-hover text-text-primary"
                          >
                            Active sessions
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowIntegrationSettings(true)}
                            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-hover text-text-primary"
                          >
                            Integration settings
                          </button>
                          {import.meta.env.DEV && (
                            <button
                              type="button"
                              onClick={() => setShowIntegrationDebugger(true)}
                              className="px-3 py-2 text-sm border border-amber-800 rounded-lg text-amber-400 hover:bg-amber-900/20"
                            >
                              Integration debugger
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowDataPointProposalModal(true)}
                            className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-hover text-text-primary"
                          >
                            Propose data point
                          </button>
                        </div>

                        {/* Global Settings Section - Simplified */}
                        <div className="bg-secondary rounded-lg mb-6">
                          <button
                            onClick={() => setGlobalSettingsExpanded(!globalSettingsExpanded)}
                            className="w-full p-6 flex items-center justify-between hover:bg-border transition-colors"
                          >
                            <h4 className="font-medium text-text-primary flex items-center gap-2">
                              <Settings className="w-5 h-5" />
                              Global Settings
                            </h4>
                            <ChevronDown className={`w-5 h-5 transition-transform ${globalSettingsExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {globalSettingsExpanded && (
                            <div className="px-6 pb-6">
                              <div className="space-y-3">
                                {/* Age Attestation - Primary focus */}
                                {STANDARD_DATA_POINTS['age_attestation'] && (
                                  <div className="flex items-center justify-between p-3 bg-modal-bg border border-border rounded-lg">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-text-primary">{STANDARD_DATA_POINTS['age_attestation'].name}</span>
                                        {(verifiedDataPoints.has('age_attestation') || attestedDataPoints.has('age_attestation')) && (
                                          <CheckCircle className="w-4 h-4 text-green-400" />
                                        )}
                                      </div>
                                      <p className="text-xs text-text-secondary">{STANDARD_DATA_POINTS['age_attestation'].description}</p>
                                    </div>
                                    {!(verifiedDataPoints.has('age_attestation') || attestedDataPoints.has('age_attestation')) && (
                                      <button
                                        onClick={() => handleRequestDataPoint('age_attestation')}
                                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                      >
                                        Add
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Third-Party Permissions Section */}
                        <div className="bg-secondary rounded-lg">
                          <button
                            onClick={() => setThirdPartyExpanded(!thirdPartyExpanded)}
                            className="w-full p-6 flex items-center justify-between hover:bg-border transition-colors"
                          >
                            <h4 className="font-medium text-text-primary flex items-center gap-2">
                              <Smartphone className="w-5 h-5" />
                              Third-Party Permissions
                            </h4>
                            <ChevronDown className={`w-5 h-5 transition-transform ${thirdPartyExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          
                          {thirdPartyExpanded && (
                            <div className="px-6 pb-6">
                              {Object.keys(privacySettings.toolPermissions).length === 0 ? (
                                <div className="text-center py-8 text-text-secondary">
                                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Smartphone className="w-8 h-8 text-gray-400" />
                                  </div>
                                  <p className="text-sm font-medium mb-2">No third-party tools connected</p>
                                  <p className="text-xs">When you connect tools, you'll be able to manage their individual permissions here</p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {Object.entries(privacySettings.toolPermissions).map(([toolId, tool]: [string, any]) => {
                                    const hasAgeZKP = verifiedDataPoints.has('age_attestation') || attestedDataPoints.has('age_attestation');
                                    const ageShared = tool.dataPoints?.includes('age_attestation') || false;
                                    const ageAvailable = tool.optionalDataPoints?.includes('age_attestation') || false;
                                    
                                    return (
                                      <div key={toolId} className="border border-border rounded-lg p-4">
                                        <div className="mb-3">
                                          <h5 className="font-medium text-text-primary">{tool.toolName}</h5>
                                          <p className="text-xs text-text-secondary">{tool.toolDescription}</p>
                                        </div>
                                        
                                        {/* Age ZKP Toggle - Only show if user has age ZKP AND tool supports it */}
                                        {hasAgeZKP && ageAvailable && (
                                          <div className="flex items-center justify-between pt-3 border-t border-border">
                                            <div className="flex-1">
                                              <p className="text-sm font-medium text-text-primary">Share Age ZKP</p>
                                              <p className="text-xs text-text-secondary">
                                                Allow {tool.toolName} to verify your age (18+) for NSFW content access
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              role="switch"
                                              aria-checked={ageShared}
                                              onClick={() => handleToggleToolDataPoint(toolId, 'age_attestation', !ageShared)}
                                              className={`
                                                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                                                ${ageShared ? 'bg-blue-600' : 'bg-neutral-700'}
                                              `}
                                            >
                                              <span
                                                className={`
                                                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                                  ${ageShared ? 'translate-x-6' : 'translate-x-1'}
                                                `}
                                              />
                                            </button>
                                          </div>
                                        )}
                                        
                                        {hasAgeZKP && !ageAvailable && (
                                          <p className="text-xs text-text-secondary pt-3 border-t border-border">
                                            Age verification not available for this app
                                          </p>
                                        )}
                                        
                                        {!hasAgeZKP && ageAvailable && (
                                          <p className="text-xs text-orange-400 pt-3 border-t border-border">
                                            Create an age ZKP first to share it with this app
                                          </p>
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => handleOpenToolSettings(toolId)}
                                          className="mt-3 text-sm text-primary hover:underline"
                                        >
                                          Tool settings
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}



                  {activeTab === 'recovery' && (
                    <RecoveryTab
                      apiToken={apiToken}
                      recoveryVaultPnId={recoveryVaultPnId}
                      authenticatedUser={authenticatedUser}
                      deviceAuth={deviceAuth}
                      canRotateIdentity={canRotateIdentity}
                      canCustodiansRead={canCustodiansRead}
                      canManageCustodians={canManageCustodians}
                      recoveryVaultSummary={recoveryVaultSummary}
                      vaultRecoveryReady={vaultRecoveryReady}
                      recoveryThreshold={recoveryThreshold}
                      setRecoveryThreshold={setRecoveryThreshold}
                      recoveryMutationAllowed={recoveryMutationAllowed}
                      recoveryKeys={recoveryKeys}
                      custodianships={custodianships}
                      recoveryRequests={recoveryRequests}
                      setError={setError}
                      setShowAddCustodianModal={setShowAddCustodianModal}
                      setSelectedCustodianForInvitation={setSelectedCustodianForInvitation}
                      setShowSendInvitationModal={setShowSendInvitationModal}
                      setShowRecoveryKeyModal={setShowRecoveryKeyModal}
                      setSelectedCustodianship={setSelectedCustodianship}
                      setSelectedRecoveryRequest={setSelectedRecoveryRequest}
                      setShowCustodianApprovalModal={setShowCustodianApprovalModal}
                      setRecoveryRequests={setRecoveryRequests}
                      bumpRecoveryAuthUi={bumpRecoveryAuthUi}
                      refreshRecoveryVault={refreshRecoveryVault}
                      handleRemoveCustodian={handleRemoveCustodian}
                      handleOpenCustodianApprovalModal={handleOpenCustodianApprovalModal}
                    />
                  )}




                  {/* Storage Tab */}
                  {activeTab === 'storage' && (
                    <div>
                      <FileStorageAggregator
                        authenticatedUser={authenticatedUser}
                        apiToken={apiToken}
                        ensureOwnerApiToken={ensureOwnerApiTokenForActiveUser}
                        deviceGate={{
                          canDriveRead,
                          canDriveUpload,
                          canProfileWrite,
                          blockedMessage: deviceAuth.deviceRequiredMessage,
                        }}
                      />
                    </div>
                  )}

                  {/* Services Tab */}
                  {activeTab === 'developer' && (
                    <DeveloperPortal authenticatedUser={authenticatedUser} />
                  )}

                  {activeTab === 'monetization' && (
                    <MonetizationTab
                      accessToken={
                        authenticatedUser?.accessToken ||
                        (authenticatedUser as { authToken?: string } | undefined)?.authToken ||
                        ''
                      }
                      showErrorMessage={showErrorMessage}
                      showSuccessMessage={showSuccessMessage}
                    />
                  )}

                  {/* Delegation Tab */}
                  {activeTab === 'subpn' && (
                    <SubPnTab
                      accessToken={apiToken}
                      connectError={connectError}
                      sessionId={authenticatedUser?.id}
                      publicKey={authenticatedUser?.publicKey}
                      availableScopes={subPnAvailableScopes}
                    />
                  )}

                  {activeTab === 'delegation' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Delegation Management</h3>
                        <p className="text-text-secondary mb-6">Manage delegations and permissions for your pN identities. Delegate specific capabilities to other pNs while maintaining control.</p>
                        
                        <div className="space-y-6">
                          <div className="bg-modal-bg border border-border rounded-lg p-4">
                            <h4 className="font-medium text-text-primary mb-3">Create New Delegation</h4>
                            <p className="text-text-secondary mb-4">Grant specific permissions to another pN identity for limited access to your data or capabilities.</p>
                            <button 
                              onClick={() => setShowDelegationModal(true)}
                              className="modal-button"
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Create Delegation
                            </button>
                          </div>
                          
                          <div className="bg-modal-bg border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-text-primary">Active Delegations</h4>
                              <button
                                type="button"
                                onClick={() => void refreshAssetDelegations()}
                                disabled={delegationsLoading || !apiToken}
                                className="text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
                              >
                                Refresh
                              </button>
                            </div>
                            {!apiToken && (
                              <p className="text-sm text-text-secondary mb-3">
                                Connect to the par Noir API (unlock identity) to view delegations.
                              </p>
                            )}
                            {delegationsError && (
                              <p className="text-sm text-red-400 mb-3">{delegationsError}</p>
                            )}
                            <div className="space-y-3">
                              {delegationsLoading ? (
                                <p className="text-sm text-text-secondary text-center py-4">Loading…</p>
                              ) : assetDelegations.length > 0 ? (
                                assetDelegations.map((delegation: any) => (
                                  <div key={delegation.id} className="p-3 bg-secondary rounded-lg">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <h5 className="font-medium text-text-primary truncate font-mono text-sm">
                                          {delegation.delegateePnIdentifier || delegation.delegateeClientId || 'Unknown delegatee'}
                                        </h5>
                                        <p className="text-xs text-text-secondary">
                                          Scope: {delegation.scope} · Asset: {delegation.ownedAssetId.slice(0, 8)}…
                                        </p>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => void handleRemoveDelegation(delegation.id)}
                                        className="text-red-400 hover:text-red-300 text-sm px-3 py-1 border border-red-800 rounded w-full sm:w-auto"
                                      >
                                        Revoke
                                      </button>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-text-secondary">
                                  <p className="text-sm">No active delegations. Use Create Delegation above.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
