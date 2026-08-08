import React from 'react';
import { CheckCircle, Smartphone, Edit3, Settings, ChevronDown, Users, Layers, Wallet, Lock } from 'lucide-react';
import { DataPointRequestsPanel } from '../components/DataPointRequestsPanel';
import { RecoveryTab } from '../components/recovery/RecoveryTab';
import { ThemeAwareProfileImage } from '../components/ThemeAwareProfileImage';
import { MonetizationTab } from '../components/monetization/MonetizationTab';
import { SubPnTab } from '../components/subpn/SubPnTab';
import { isIdentityVerificationAvailable } from '../config/verification';
import { FileStorageAggregator } from '../components/storage/FileStorageAggregator';
import { SectionInfo } from '../components/common/SectionInfo';
import { PrivacyDataPointsPanel } from '../components/privacy/PrivacyDataPointsPanel';
import { AdvancedPrivacySettingsBody } from '../components/privacy/AdvancedPrivacySettingsBody';
import { PublicNamesSection } from '../components/privacy/PublicNamesSection';
import { STANDARD_DATA_POINTS, getDataPointMinLevel } from '@par-noir/standard-data-points';
import { setOwnerApiPnIdentifier } from '../services/ownerApiService';
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
  attestedHydrationStatus?: 'pending' | 'loading' | 'ready';
  globalSettingsExpanded: any;
  thirdPartyExpanded: any;
  privacySettings: any;
  setPrivacySettings: any;
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
  handleDeactivateTool: any;
  handleToggleGlobalDataPoint: any;
  bumpRecoveryAuthUi: any;
  refreshRecoveryVault: any;
  handleRemoveCustodian: any;
  handleDownloadRecoveryKey: any;
  handleOpenCustodianApprovalModal: any;
  ensureOwnerApiTokenForActiveUser: any;
  getEncryptedIdentityForApiToken: (
    identityPublicKeyOrId: string | undefined
  ) => Promise<{ encryptedData: string; iv: string; salt: string } | null>;
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
    attestedHydrationStatus = 'ready',
    globalSettingsExpanded,
    thirdPartyExpanded,
    privacySettings,
    setPrivacySettings,
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
    handleDeactivateTool,
    handleToggleGlobalDataPoint,
    bumpRecoveryAuthUi,
    refreshRecoveryVault,
    handleRemoveCustodian,
    handleDownloadRecoveryKey,
    handleOpenCustodianApprovalModal,
    ensureOwnerApiTokenForActiveUser,
    getEncryptedIdentityForApiToken,
    showErrorMessage,
    showSuccessMessage,
    refreshAssetDelegations,
    handleRemoveDelegation
  } = props;

  React.useEffect(() => {
    setOwnerApiPnIdentifier(recoveryVaultPnId || null);
    return () => setOwnerApiPnIdentifier(null);
  }, [recoveryVaultPnId]);

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

                {/* Tab Content — keep-alive: panels stay mounted; inactive are hidden */}
                <div className="min-h-[400px]">
                  <div
                    className="space-y-6"
                    hidden={activeTab !== 'privacy'}
                    aria-hidden={activeTab !== 'privacy'}
                    data-dashboard-tab="privacy"
                  >
                      <div>
                        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
                          <h3 className="text-lg font-semibold text-text-primary">Privacy & Sharing Settings</h3>
                          {canProfileRead && (
                            isIdentityVerificationAvailable() ? (
                              <button
                                type="button"
                                onClick={() => setShowVerificationModal(true)}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 shrink-0"
                              >
                                Verify
                              </button>
                            ) : (
                              <span className="text-xs text-text-secondary shrink-0">
                                Identity Verify (Veriff) not enabled
                              </span>
                            )
                          )}
                        </div>

                        {!canProfileRead ? (
                          <div className="bg-secondary rounded-lg p-6 flex items-start gap-3">
                            <Lock className="w-5 h-5 text-text-secondary shrink-0 mt-0.5" />
                            <p className="text-sm text-text-secondary">{deviceAuth.deviceRequiredMessage}</p>
                          </div>
                        ) : (
                          <>
                        <PublicNamesSection
                          accessToken={apiToken || null}
                          pnIdentifier={recoveryVaultPnId || null}
                        />
                        {authenticatedUser && (
                          <DataPointRequestsPanel
                            authenticatedUser={authenticatedUser}
                            apiToken={apiToken}
                            onResponded={() => {
                              /* permissions refresh on next load */
                            }}
                          />
                        )}

                        {import.meta.env.DEV && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            <button
                              type="button"
                              onClick={() => setShowIntegrationDebugger(true)}
                              className="px-3 py-2 text-sm border border-amber-800 rounded-lg text-amber-400 hover:bg-amber-900/20"
                            >
                              Integration debugger
                            </button>
                          </div>
                        )}

                        <PrivacyDataPointsPanel
                          attestedDataPoints={attestedDataPoints}
                          verifiedDataPoints={verifiedDataPoints}
                          attestedHydrationStatus={attestedHydrationStatus}
                          onRequestDataPoint={handleRequestDataPoint}
                        />

                        {/* Third-Party Permissions Section */}
                        <div className="bg-secondary rounded-lg mb-6">
                          <button
                            type="button"
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
                              {Object.entries(privacySettings.toolPermissions).filter(
                                ([, tool]: [string, any]) => tool?.status !== 'revoked'
                              ).length === 0 ? (
                                <div className="text-center py-8 text-text-secondary">
                                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Smartphone className="w-8 h-8 text-gray-400" />
                                  </div>
                                  <p className="text-sm font-medium mb-2">No third-party tools connected</p>
                                  <p className="text-xs">When you connect tools, you'll be able to manage their individual permissions here</p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {Object.entries(privacySettings.toolPermissions)
                                    .filter(([, tool]: [string, any]) => tool?.status !== 'revoked')
                                    .map(([toolId, tool]: [string, any]) => {
                                    const requestedIds = [
                                      ...new Set([
                                        ...(tool.requiredDataPoints || []),
                                        ...(tool.optionalDataPoints || []),
                                      ]),
                                    ] as string[];

                                    return (
                                      <div key={toolId} className="border border-border rounded-lg p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <h5 className="font-medium text-text-primary">{tool.toolName}</h5>
                                            <p className="text-xs text-text-secondary mt-0.5">{tool.toolDescription}</p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => void handleDeactivateTool(toolId)}
                                            className="shrink-0 px-3 py-1 text-sm text-red-400 border border-red-800/60 rounded hover:bg-red-900/20"
                                          >
                                            Revoke
                                          </button>
                                        </div>

                                        <div className="mt-3 ml-3 pl-3 border-l border-border space-y-2">
                                          {requestedIds.length === 0 ? (
                                            <p className="text-xs text-text-secondary py-1">
                                              No ZKP data points requested by this app
                                            </p>
                                          ) : (
                                            requestedIds.map((dataPointId) => {
                                              const catalog = STANDARD_DATA_POINTS[dataPointId];
                                              const name = catalog?.name || dataPointId;
                                              const minLevel = getDataPointMinLevel(
                                                tool.dataPointLevels,
                                                dataPointId
                                              );
                                              const isVerified = verifiedDataPoints.has(dataPointId);
                                              const hasProof =
                                                isVerified || attestedDataPoints.has(dataPointId);
                                              const shared = tool.dataPoints?.includes(dataPointId) || false;
                                              const globallyAllowed =
                                                privacySettings.dataPoints?.[dataPointId]?.globalSetting !== false;
                                              const meetsLevel =
                                                minLevel === 'verified' ? isVerified : hasProof;
                                              const statusLabel = isVerified ? 'verified' : 'attested';
                                              const permissionLabel = `${name} (${statusLabel})`;

                                              if (!globallyAllowed) {
                                                return (
                                                  <p
                                                    key={dataPointId}
                                                    className="text-xs text-text-secondary py-1"
                                                  >
                                                    {name} sharing is disabled in Global Settings
                                                  </p>
                                                );
                                              }

                                              if (!hasProof) {
                                                return (
                                                  <p
                                                    key={dataPointId}
                                                    className="text-xs text-orange-400 py-1"
                                                  >
                                                    Create a {name} ZKP first to share it with this app
                                                  </p>
                                                );
                                              }

                                              if (!meetsLevel) {
                                                return (
                                                  <p
                                                    key={dataPointId}
                                                    className="text-xs text-orange-400 py-1"
                                                  >
                                                    Verify {name} with government ID first — attested is not accepted
                                                  </p>
                                                );
                                              }

                                              return (
                                                <div
                                                  key={dataPointId}
                                                  className="flex items-center justify-between gap-3 py-1"
                                                >
                                                  <p className="text-sm font-medium text-text-primary min-w-0">
                                                    {permissionLabel}
                                                  </p>
                                                  <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={shared}
                                                    aria-label={`Share ${permissionLabel}`}
                                                    onClick={() =>
                                                      handleToggleToolDataPoint(
                                                        toolId,
                                                        dataPointId,
                                                        !shared
                                                      )
                                                    }
                                                    className={`
                                                      relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
                                                      ${shared ? 'bg-blue-600' : 'bg-neutral-700'}
                                                    `}
                                                  >
                                                    <span
                                                      className={`
                                                        inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                                                        ${shared ? 'translate-x-6' : 'translate-x-1'}
                                                      `}
                                                    />
                                                  </button>
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Global Settings — attested/verified points + third-party disable */}
                        <div className="bg-secondary rounded-lg">
                          <button
                            type="button"
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
                              <AdvancedPrivacySettingsBody
                                settings={privacySettings}
                                attestedDataPoints={attestedDataPoints}
                                verifiedDataPoints={verifiedDataPoints}
                                onToggleShareWithThirdParties={(id, allowed) =>
                                  void handleToggleGlobalDataPoint(id, allowed)
                                }
                              />
                            </div>
                          )}
                        </div>
                          </>
                        )}
                      </div>
                  </div>

                  <div
                    hidden={activeTab !== 'recovery'}
                    aria-hidden={activeTab !== 'recovery'}
                    data-dashboard-tab="recovery"
                  >
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
                      loadEncryptedIdentity={(id) => getEncryptedIdentityForApiToken(id)}
                    />
                  </div>

                  <div
                    hidden={activeTab !== 'storage'}
                    aria-hidden={activeTab !== 'storage'}
                    data-dashboard-tab="storage"
                  >
                    <FileStorageAggregator
                      authenticatedUser={authenticatedUser}
                      apiToken={apiToken}
                      ensureOwnerApiToken={ensureOwnerApiTokenForActiveUser}
                      hasKeyedDevices={!!deviceAuth.hasKeyedDevices}
                      isKeyedSession={!!deviceAuth.isKeyedSession}
                      deviceGate={{
                        canDriveRead,
                        canDriveUpload,
                        canProfileWrite,
                        blockedMessage: deviceAuth.deviceRequiredMessage,
                      }}
                    />
                  </div>

                  <div
                    hidden={activeTab !== 'monetization'}
                    aria-hidden={activeTab !== 'monetization'}
                    data-dashboard-tab="monetization"
                  >
                    <MonetizationTab
                      accessToken={apiToken || ''}
                      showErrorMessage={showErrorMessage}
                      showSuccessMessage={showSuccessMessage}
                    />
                  </div>

                  <div
                    hidden={activeTab !== 'subpn'}
                    aria-hidden={activeTab !== 'subpn'}
                    data-dashboard-tab="subpn"
                  >
                    <SubPnTab
                      accessToken={apiToken}
                      pnIdentifier={recoveryVaultPnId}
                      connectError={connectError}
                      sessionId={authenticatedUser?.id}
                      publicKey={authenticatedUser?.publicKey}
                      availableScopes={subPnAvailableScopes}
                    />
                  </div>

                  <div
                    className="space-y-6"
                    hidden={activeTab !== 'delegation'}
                    aria-hidden={activeTab !== 'delegation'}
                    data-dashboard-tab="delegation"
                  >
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <h3 className="text-lg font-semibold text-text-primary">Delegation Management</h3>
                          <SectionInfo title="Delegation Management">
                            <p>
                              Manage delegations and permissions for your pN identities. Delegate specific
                              capabilities to other pNs while maintaining control.
                            </p>
                          </SectionInfo>
                        </div>
                        
                        <div className="space-y-6">
                          <div className="bg-modal-bg border border-border rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <h4 className="font-medium text-text-primary">Create New Delegation</h4>
                              <SectionInfo title="Create New Delegation">
                                <p>
                                  Grant specific permissions to another pN identity for limited access to your data
                                  or capabilities.
                                </p>
                              </SectionInfo>
                            </div>
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
                </div>
              </div>
            </div>
          </div>
        )}
    </>
  );
}
