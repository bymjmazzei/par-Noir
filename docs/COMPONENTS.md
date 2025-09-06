# Component Documentation

## Overview

This document provides comprehensive documentation for all components in the par Noir Identity Dashboard.

## Core Components

### BiometricSetup

**Component Name:** BiometricSetup

**Props Interface:** BiometricSetup

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `onSuccess`: () => void
- `identityId`: string
- `pnName`: string

**File:** `components/BiometricSetup.tsx`

---

### ComplianceDataCollection

**Component Name:** ComplianceDataCollection

**Props Interface:** ComplianceDataCollection

**Props:**
- `platform`: string
- `fields`: ComplianceField[]
- `consentText`: string
- `dataUsage`: string
- `onSubmit`: (data: Record<string, any>) => void
- `onCancel`: () => void

**File:** `components/ComplianceDataCollection.tsx`

---

### DashboardDropdown

**Props Interface:** DashboardDropdown

**Props:**
- `onNavigate`: (section: string) => void
- `onLogout`: () => void
- `authenticatedUser`: any

**File:** `components/DashboardDropdown.tsx`

---

### ErrorBoundary

**File:** `components/ErrorBoundary.tsx`

---

### Header

**Props Interface:** Header

**Props:**
- `authenticatedUser`: any
- `onLogout`: () => void
- `onOfflineModeChange`: (offline: boolean) => void
- `isInstallable`: boolean
- `isInstalled`: boolean
- `isInstalling`: boolean
- `deferredPrompt`: any

**File:** `components/Header.tsx`

---

### IPFSStatus

**Component Name:** IPFSStatus

**File:** `components/IPFSStatus.tsx`

---

### Icon

**Component Name:** Icon

**Props Interface:** Icon

**Props:**

**File:** `components/Icon.tsx`

---

### IdentityManager

**Component Name:** IdentityManager

**Props Interface:** IdentityManager

**Props:**
- `identities`: DIDInfo[]
- `selectedIdentity`: DIDInfo | null
- `onIdentitySelect`: (identity: DIDInfo) => void
- `onIdentityCreate`: (identity: DIDInfo) => void
- `onIdentityUpdate`: (id: string, updates: Partial<DIDInfo>) => void
- `onIdentityDelete`: (id: string) => void
- `onIdentityImport`: (file: File) => Promise<void>
- `onIdentityExport`: (identity: DIDInfo) => void
- `onRecoverySetup`: (identityId: string, custodians: RecoveryCustodian[]) => void
- `onBiometricSetup`: (identityId: string, enabled: boolean) => void

**File:** `components/IdentityManager.tsx`

---

### IdentitySelector

**Component Name:** IdentitySelector

**Props Interface:** IdentitySelector

**Props:**
- `selectedIdentity`: SimpleIdentity | null
- `onIdentitySelect`: (identity: SimpleIdentity | null) => void
- `onUploadNew`: () => void
- `onCreateNew`: () => void
- `onDeleteIdentity`: (identity: SimpleIdentity) => void

**File:** `components/IdentitySelector.tsx`

---

### LazyLoader

**Component Name:** LazyPWAInstall

**Props Interface:** LazyLoader

**Props:**
- `children`: React.ReactNode

**File:** `components/LazyLoader.tsx`

---

### LicenseDashboard

**Component Name:** LicenseDashboard

**File:** `components/LicenseDashboard.tsx`

---

### Logo

**Component Name:** Logo

**Props Interface:** Logo

**Props:**

**File:** `components/Logo.tsx`

---

### NicknameEditor

**Component Name:** NicknameEditor

**Props Interface:** NicknameEditor

**Props:**
- `identity`: SimpleIdentity
- `onSave`: (updatedIdentity: SimpleIdentity) => void
- `onCancel`: () => void

**File:** `components/NicknameEditor.tsx`

---

### OfflineIndicator

**Component Name:** OfflineIndicator

**Props Interface:** OfflineIndicator

**Props:**

**File:** `components/OfflineIndicator.tsx`

---

### OfflineModeToggle

**Component Name:** OfflineModeToggle

**Props Interface:** OfflineModeToggle

**Props:**
- `isOfflineMode`: boolean) => void

**File:** `components/OfflineModeToggle.tsx`

---

### Onboarding

**Component Name:** Onboarding

**Props Interface:** Onboarding

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `onComplete`: () => void

**File:** `components/Onboarding.tsx`

---

### OnboardingWizard

**Component Name:** OnboardingWizard

**Props Interface:** OnboardingWizard

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `onComplete`: () => void
- `nickname`: string) => void
- `section`: string) => void

**File:** `components/OnboardingWizard.tsx`

---

### PWAInstall

**Component Name:** PWAInstall

**Props Interface:** PWAInstall

**Props:**
- `pwaState`: {
- `isInstallable`: boolean
- `isInstalled`: boolean
- `isInstalling`: boolean
- `deferredPrompt`: any

**File:** `components/PWAInstall.tsx`

---

### PWALockScreen

**Props Interface:** PWALockScreen

**Props:**
- `isLocked`: boolean
- `onUnlock`: () => void
- `onFallback`: () => void

**File:** `components/PWALockScreen.tsx`

---

### ProfilePictureEditor

**Component Name:** ProfilePictureEditor

**Props Interface:** ProfilePictureEditor

**Props:**
- `onSave`: (pictureData: string) => void
- `onCancel`: () => void
- `isOpen`: boolean

**File:** `components/ProfilePictureEditor.tsx`

---

### QRCodeScanner

**Component Name:** QRCodeScanner

**Props Interface:** QRCodeScanner

**Props:**
- `onScan`: (data: string) => void
- `onClose`: () => void
- `isOpen`: boolean

**File:** `components/QRCodeScanner.tsx`

---

### SessionManager

**Component Name:** SessionManager

**Props Interface:** SessionManager

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/SessionManager.tsx`

---

### SimpleIdentityList

**Component Name:** SimpleIdentityList

**Props Interface:** SimpleIdentityList

**Props:**
- `onIdentitySelect`: (identity: SimpleIdentity) => void
- `onCreateNew`: () => void
- `onImportFile`: () => void

**File:** `components/SimpleIdentityList.tsx`

---

### SimpleUnlock

**Component Name:** SimpleUnlock

**Props Interface:** SimpleUnlock

**Props:**
- `onUnlock`: (file: File, passcode: string) => Promise<void>
- `onCancel`: () => void

**File:** `components/SimpleUnlock.tsx`

---

### SyncManager

**Component Name:** SyncManager

**Props Interface:** SyncManager

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `schedule`: SyncSchedule
- `onScheduleChange`: (schedule: SyncSchedule) => void

**File:** `components/SyncManager.tsx`

---

### ThemeAwareProfileImage

**Component Name:** ThemeAwareProfileImage

**Props Interface:** ThemeAwareProfileImage

**Props:**

**File:** `components/ThemeAwareProfileImage.tsx`

---

### ThemeSwitcher

**Component Name:** ThemeSwitcher

**Props Interface:** ThemeSwitcher

**Props:**

**File:** `components/ThemeSwitcher.tsx`

---

### VirtualizedList.refactored

**Component Name:** VirtualizedList

**Props Interface:** VirtualizedIdentityList

**Props:**
- `identities`: IdentityItem[]
- `onIdentitySelect`: (identity: IdentityItem) => void

**File:** `components/VirtualizedList.refactored.tsx`

---

### VirtualizedList

**Component Name:** VirtualizedList

**Props Interface:** VirtualizedIdentityList

**Props:**
- `identities`: IdentityItem[]
- `onIdentitySelect`: (identity: IdentityItem) => void

**File:** `components/VirtualizedList.tsx`

---

### AppMain

**Component Name:** AppMain

**File:** `components/app/AppMain.tsx`

---

### AppStateManager

**Component Name:** useAppState

**File:** `components/app/AppStateManager.tsx`

---

### ExportTransferManager

**Component Name:** useExportTransferManager

**File:** `components/app/ExportTransferManager.tsx`

---

### IdentityManagement

**Component Name:** useIdentityManagement

**File:** `components/app/IdentityManagement.tsx`

---

### MainDashboard

**Component Name:** MainDashboard

**Props Interface:** MainDashboard

**Props:**
- `dids`: DIDInfo[]
- `selectedDID`: DIDInfo | null
- `onDIDSelect`: (did: DIDInfo) => void
- `onDIDCreate`: (did: DIDInfo) => void
- `onDIDUpdate`: (did: DIDInfo) => void
- `onDIDDelete`: (didId: string) => void

**File:** `components/app/MainDashboard.tsx`

---

### PWAManager

**Component Name:** PWAManager

**Props Interface:** PWAManager

**Props:**
- `onInstall`: () => void
- `onUpdate`: () => void

**File:** `components/app/PWAManager.tsx`

---

### PerformanceMonitor

**Component Name:** usePerformanceMonitoring

**File:** `components/app/PerformanceMonitor.tsx`

---

### RecoveryCustodianManager

**Component Name:** useRecoveryCustodianManager

**File:** `components/app/RecoveryCustodianManager.tsx`

---

### index

**File:** `components/app/index.ts`

---

### CommunitySection

**Component Name:** CommunitySection

**File:** `components/developer-portal/CommunitySection.tsx`

---

### DeveloperPortalHeader

**Component Name:** DeveloperPortalHeader

**Props Interface:** DeveloperPortalHeader

**Props:**
- `licenseInfo`: any
- `onShowLicenseModal`: () => void
- `onShowProposalModal`: () => void

**File:** `components/developer-portal/DeveloperPortalHeader.tsx`

---

### DocumentationSection

**Component Name:** DocumentationSection

**File:** `components/developer-portal/DocumentationSection.tsx`

---

### PendingProposalsSection

**Component Name:** PendingProposalsSection

**Props Interface:** PendingProposalsSection

**Props:**
- `pendingProposals`: Proposal[]

**File:** `components/developer-portal/PendingProposalsSection.tsx`

---

### QuickStartSection

**Component Name:** QuickStartSection

**Props Interface:** QuickStartSection

**Props:**
- `onCopyCode`: (button: React.MouseEvent<HTMLButtonElement>) => void

**File:** `components/developer-portal/QuickStartSection.tsx`

---

### index

**File:** `components/developer-portal/index.ts`

---

### index

**File:** `components/integrations/index.ts`

---

### DeveloperPortalLazy

**Component Name:** DeveloperPortalLazy

**File:** `components/lazy/DeveloperPortalLazy.tsx`

---

### OnboardingLazy

**Component Name:** OnboardingLazy

**File:** `components/lazy/OnboardingLazy.tsx`

---

### OnboardingWizardLazy

**Component Name:** OnboardingWizardLazy

**File:** `components/lazy/OnboardingWizardLazy.tsx`

---

### TransferReceiverLazy

**Component Name:** TransferReceiverLazy

**File:** `components/lazy/TransferReceiverLazy.tsx`

---

### index

**File:** `components/lazy/index.ts`

---

### CryptoPaymentSection

**Component Name:** CryptoPaymentSection

**Props Interface:** CryptoPaymentSection

**Props:**
- `cryptoCurrency`: 'BTC' | 'ETH' | 'XRP' | 'USDT'
- `onCryptoCurrencyChange`: (currency: 'BTC' | 'ETH' | 'XRP' | 'USDT') => void
- `inputBgColor`: string
- `borderColor`: string
- `textColor`: string
- `secondaryTextColor`: string

**File:** `components/license/CryptoPaymentSection.tsx`

---

### IdentityFileUpload

**Component Name:** IdentityFileUpload

**Props Interface:** IdentityFileUpload

**Props:**
- `identityFile`: File | null
- `onFileUpload`: (file: File | null) => void
- `borderColor`: string
- `inputBgColor`: string
- `textColor`: string
- `secondaryTextColor`: string

**File:** `components/license/IdentityFileUpload.tsx`

---

### LicenseFeatures

**Component Name:** LicenseFeatures

**Props Interface:** LicenseFeatures

**Props:**
- `licenseType`: string

**File:** `components/license/LicenseFeatures.tsx`

---

### LicenseInfoDisplay

**Component Name:** LicenseInfoDisplay

**Props Interface:** LicenseInfoDisplay

**Props:**
- `licenseInfo`: LicenseInfo
- `licenseKey`: string
- `onRemoveLicense`: () => void

**File:** `components/license/LicenseInfoDisplay.tsx`

---

### LicenseTypeSelector

**Component Name:** LicenseTypeSelector

**Props Interface:** LicenseTypeSelector

**Props:**
- `licenseType`: 'perpetual' | 'annual'
- `onLicenseTypeChange`: (type: 'perpetual' | 'annual') => void
- `licenseTypes`: Record<string, LicenseType>

**File:** `components/license/LicenseTypeSelector.tsx`

---

### LicenseVerification

**Component Name:** LicenseVerification

**Props Interface:** LicenseVerification

**Props:**
- `licenseProof`: LicenseProof | null
- `receipt`: LicenseReceipt | null
- `licenseKey`: string | undefined
- `onVerifyProof`: () => void
- `onDownloadProof`: () => void
- `onDownloadReceipt`: () => void

**File:** `components/license/LicenseVerification.tsx`

---

### UsagePatternDetection

**Component Name:** UsagePatternDetection

**Props Interface:** UsagePatternDetection

**Props:**
- `usagePattern`: UsagePattern | null
- `licenseInfo`: any
- `onTestDetection`: () => void
- `onTestEnforcement`: () => void
- `onTestGracePeriod`: () => void
- `onSimulateExpiration`: () => void
- `onResetAll`: () => void

**File:** `components/license/UsagePatternDetection.tsx`

---

### index

**File:** `components/license/index.ts`

---

### WizardFooter

**Component Name:** WizardFooter

**Props Interface:** WizardFooter

**Props:**
- `isFirstStep`: boolean
- `isLastStep`: boolean
- `onSkip`: () => void
- `onPrevious`: () => void
- `onNext`: () => void

**File:** `components/onboarding/WizardFooter.tsx`

---

### WizardHeader

**Component Name:** WizardHeader

**Props Interface:** WizardHeader

**Props:**
- `currentStepData`: {
- `icon`: React.ReactNode
- `title`: string

**File:** `components/onboarding/WizardHeader.tsx`

---

### WizardProgress

**Component Name:** WizardProgress

**Props Interface:** WizardProgress

**Props:**
- `steps`: WizardStep[]
- `currentStep`: number
- `completedSteps`: Set<string>

**File:** `components/onboarding/WizardProgress.tsx`

---

### WizardStepContent

**Component Name:** WizardStepContent

**Props Interface:** WizardStepContent

**Props:**
- `currentStepData`: WizardStep
- `showInfo`: boolean
- `nickname`: string
- `onNicknameChange`: (nickname: string) => void
- `onStepAction`: () => void
- `completedSteps`: Set<string>

**File:** `components/onboarding/WizardStepContent.tsx`

---

### index

**File:** `components/onboarding/index.ts`

---

### ActiveConnections

**Component Name:** ActiveConnections

**Props Interface:** ActiveConnections

**Props:**
- `connections`: ActiveConnection[]
- `onRevokeConnection`: (connectionId: string) => void

**File:** `components/privacy/ActiveConnections.tsx`

---

### AdvancedSettings

**Component Name:** AdvancedSettings

**Props Interface:** AdvancedSettings

**Props:**
- `privacySettings`: {
- `crossPlatformSync`: boolean
- `auditLogging`: boolean

**File:** `components/privacy/AdvancedSettings.tsx`

---

### DataAccessRequests

**Component Name:** DataAccessRequests

**Props Interface:** DataAccessRequests

**Props:**
- `requests`: DataAccessRequest[]
- `onRequestResponse`: (requestId: string, approved: boolean) => void

**File:** `components/privacy/DataAccessRequests.tsx`

---

### StatsCards

**Component Name:** StatsCards

**Props Interface:** StatsCards

**Props:**
- `activeConnectionsCount`: number
- `pendingRequestsCount`: number

**File:** `components/privacy/StatsCards.tsx`

---

### index

**File:** `components/privacy/index.ts`

---

### EmojiDatabase

**Component Name:** EMOJI_DATABASE

**File:** `components/profile/EmojiDatabase.ts`

---

### EmojiSelector

**Component Name:** EmojiSelector

**Props Interface:** EmojiSelector

**Props:**
- `emojiSearch`: string
- `onEmojiSearchChange`: (search: string) => void
- `onEmojiSelect`: (emoji: string) => void

**File:** `components/profile/EmojiSelector.tsx`

---

### FileUpload

**Component Name:** FileUpload

**Props Interface:** FileUpload

**Props:**
- `uploadedFile`: File | null
- `onFileUpload`: (file: File | null) => void

**File:** `components/profile/FileUpload.tsx`

---

### PicturePreview

**Component Name:** PicturePreview

**Props Interface:** PicturePreview

**Props:**
- `previewUrl`: string
- `onImageError`: () => void

**File:** `components/profile/PicturePreview.tsx`

---

### index

**File:** `components/profile/index.ts`

---

### ThreatHistoryPanel

**Component Name:** ThreatHistoryPanel

**Props Interface:** ThreatHistoryPanel

**Props:**
- `threats`: ThreatEvent[]

**File:** `components/security/ThreatHistoryPanel.tsx`

---

### index

**File:** `components/security/index.ts`

---

### TransferActions

**Component Name:** TransferActions

**Props Interface:** TransferActions

**Props:**
- `loading`: boolean
- `transferPasscode`: string
- `unlockedIdentityData`: any
- `onUnlock`: () => void
- `onExport`: () => void
- `onClose`: () => void
- `success`: string

**File:** `components/transfer/TransferActions.tsx`

---

### TransferInfoCard

**Component Name:** TransferInfoCard

**Props Interface:** TransferInfoCard

**Props:**
- `transferData`: TransferData

**File:** `components/transfer/TransferInfoCard.tsx`

---

### TransferReceiverHeader

**Component Name:** TransferReceiverHeader

**Props Interface:** TransferReceiverHeader

**Props:**
- `onClose`: () => void

**File:** `components/transfer/TransferReceiverHeader.tsx`

---

### TransferStatus

**Component Name:** TransferStatus

**Props Interface:** TransferStatus

**Props:**
- `error`: string
- `success`: string

**File:** `components/transfer/TransferStatus.tsx`

---

### index

**File:** `components/transfer/index.ts`

---

### EmptyState

**Component Name:** EmptyState

**Props Interface:** EmptyState

**Props:**
- `searchTerm`: string

**File:** `components/virtualized/EmptyState.tsx`

---

### IdentityListItem

**Component Name:** IdentityListItem

**Props Interface:** IdentityListItem

**Props:**
- `identity`: IdentityItem

**File:** `components/virtualized/IdentityListItem.tsx`

---

### SearchAndFilterBar

**Component Name:** SearchAndFilterBar

**File:** `components/virtualized/SearchAndFilterBar.tsx`

---

### VirtualizedListContainer

**Component Name:** VirtualizedListContainer

**File:** `components/virtualized/VirtualizedListContainer.tsx`

---

### index

**File:** `components/virtualized/index.ts`

---

## Security Components

### CrossPlatformAuth

**Component Name:** CrossPlatformAuth

**Props Interface:** CrossPlatformAuth

**Props:**
- `session`: any) => void
- `error`: Error) => void
- `id`: string
- `username`: string
- `status`: string

**File:** `components/CrossPlatformAuth.tsx`

---

### DecentralizedAuth

**Component Name:** DecentralizedAuth

**Props Interface:** DecentralizedAuth

**Props:**
- `identity`: Identity) => void
- `error`: string) => void

**File:** `components/DecentralizedAuth.tsx`

---

### DistributedAuth

**Component Name:** DistributedAuth

**Props Interface:** DistributedAuth

**Props:**
- `session`: any) => void
- `error`: Error) => void

**File:** `components/DistributedAuth.tsx`

---

### RealtimeSecurityAlerts

**Component Name:** RealtimeSecurityAlerts

**Props Interface:** RealtimeSecurityAlerts

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/RealtimeSecurityAlerts.tsx`

---

### SecurityDashboard

**Component Name:** SecurityDashboard

**Props Interface:** SecurityDashboard

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/SecurityDashboard.tsx`

---

### SecurityPanel.refactored

**Component Name:** SecurityPanel

**Props Interface:** SecurityPanel

**Props:**
- `event`: any) => void

**File:** `components/SecurityPanel.refactored.tsx`

---

### SecurityPanel

**Component Name:** SecurityPanel

**Props Interface:** SecurityPanel

**Props:**
- `event`: any) => void

**File:** `components/SecurityPanel.tsx`

---

### UnifiedAuth

**Component Name:** UnifiedAuth

**Props Interface:** UnifiedAuth

**Props:**
- `session`: any) => void
- `error`: Error) => void

**File:** `components/UnifiedAuth.tsx`

---

### ZKAuth

**Component Name:** ZKAuth

**Props Interface:** ZKAuth

**Props:**
- `session`: any) => void
- `error`: Error) => void

**File:** `components/ZKAuth.tsx`

---

### AuthenticationManager

**Component Name:** AuthenticationManager

**Props Interface:** AuthenticationManager

**Props:**
- `onAuthenticationChange`: (session: AuthSession | null) => void
- `onIdentityUnlock`: (identity: EncryptedIdentity) => void

**File:** `components/app/AuthenticationManager.tsx`

---

### SecurityPanelLazy

**Component Name:** SecurityPanelLazy

**File:** `components/lazy/SecurityPanelLazy.tsx`

---

### SecurityHeader

**Component Name:** SecurityHeader

**Props Interface:** SecurityHeader

**Props:**
- `lastCheck`: string
- `isChecking`: boolean
- `onCheckSecurity`: () => void

**File:** `components/security/SecurityHeader.tsx`

---

### SecurityScoreCard

**Component Name:** SecurityScoreCard

**Props Interface:** SecurityScoreCard

**Props:**
- `threats`: any[]
- `vulnerabilities`: any[]

**File:** `components/security/SecurityScoreCard.tsx`

---

### SecuritySettingsPanel

**Component Name:** SecuritySettingsPanel

**Props Interface:** SecuritySettingsPanel

**Props:**
- `settings`: SecuritySettings
- `onSettingUpdate`: (key: keyof SecuritySettings, value: any) => void

**File:** `components/security/SecuritySettingsPanel.tsx`

---

## Privacy Components

### EnhancedPrivacyPanel

**Component Name:** EnhancedPrivacyPanel

**Props Interface:** EnhancedPrivacyPanel

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `settings`: GlobalPrivacySettings
- `onSettingsChange`: (settings: GlobalPrivacySettings) => void

**File:** `components/EnhancedPrivacyPanel.tsx`

---

### PrivacyControls.refactored

**Component Name:** PrivacyControls

**Props Interface:** PrivacyControls

**Props:**
- `settings`: GlobalPrivacySettings) => void
- `request`: any) => void

**File:** `components/PrivacyControls.refactored.tsx`

---

### PrivacyControls

**Component Name:** PrivacyControls

**Props Interface:** PrivacyControls

**Props:**
- `settings`: GlobalPrivacySettings) => void
- `request`: any) => void

**File:** `components/PrivacyControls.tsx`

---

### PrivacyPanel

**Component Name:** PrivacyPanel

**Props Interface:** PrivacyPanel

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `settings`: PrivacySettings
- `onSettingsChange`: (settings: PrivacySettings) => void

**File:** `components/PrivacyPanel.tsx`

---

### PrivacyControlsLazy

**Component Name:** PrivacyControlsLazy

**File:** `components/lazy/PrivacyControlsLazy.tsx`

---

### PrivacyControlsHeader

**Component Name:** PrivacyControlsHeader

**Props Interface:** PrivacyControlsHeader

**Props:**
- `showAdvanced`: boolean
- `onToggleAdvanced`: () => void

**File:** `components/privacy/PrivacyControlsHeader.tsx`

---

### PrivacyScoreCard

**Component Name:** PrivacyScoreCard

**Props Interface:** PrivacyScoreCard

**Props:**
- `privacySettings`: {
- `dataSharing`: 'private' | 'selective' | 'public'
- `analytics`: boolean
- `thirdPartyAccess`: boolean
- `locationSharing`: boolean
- `biometricData`: boolean
- `crossPlatformSync`: boolean
- `dataRetention`: 'minimal' | 'standard' | 'extended'

**File:** `components/privacy/PrivacyScoreCard.tsx`

---

### PrivacySettingsPanel

**Component Name:** PrivacySettingsPanel

**Props Interface:** PrivacySettingsPanel

**Props:**
- `privacySettings`: {
- `dataSharing`: 'private' | 'selective' | 'public'
- `analytics`: boolean
- `thirdPartyAccess`: boolean
- `locationSharing`: boolean
- `biometricData`: boolean
- `dataRetention`: 'minimal' | 'standard' | 'extended'
- `transparency`: 'low' | 'medium' | 'high'

**File:** `components/privacy/PrivacySettingsPanel.tsx`

---

### PrivacyPolicy

**File:** `pages/PrivacyPolicy.tsx`

---

## Integration Components

### IntegrationDebugger

**Component Name:** IntegrationDebugger

**Props Interface:** IntegrationDebugger

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/IntegrationDebugger.tsx`

---

### IntegrationSettingsManager.refactored

**Component Name:** IntegrationSettingsManager

**Props Interface:** IntegrationSettingsManager

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/IntegrationSettingsManager.refactored.tsx`

---

### IntegrationSettingsManager

**Component Name:** IntegrationSettingsManager

**Props Interface:** IntegrationSettingsManager

**Props:**
- `isOpen`: boolean
- `onClose`: () => void

**File:** `components/IntegrationSettingsManager.tsx`

---

### IntegrationCard

**Component Name:** IntegrationCard

**Props Interface:** IntegrationCard

**Props:**
- `integrationKey`: string
- `integration`: IntegrationConfig
- `showPasswords`: { [key: string]: boolean

**File:** `components/integrations/IntegrationCard.tsx`

---

### IntegrationFooter

**Component Name:** IntegrationFooter

**Props Interface:** IntegrationFooter

**Props:**
- `hasChanges`: boolean
- `onReset`: () => void
- `onCancel`: () => void
- `onSave`: () => void

**File:** `components/integrations/IntegrationFooter.tsx`

---

### IntegrationHeader

**Component Name:** IntegrationHeader

**Props Interface:** IntegrationHeader

**Props:**
- `onClose`: () => void

**File:** `components/integrations/IntegrationHeader.tsx`

---

### IntegrationTestButton

**Component Name:** IntegrationTestButton

**Props Interface:** IntegrationTestButton

**Props:**
- `integrationKey`: string
- `testingStatus`: 'idle' | 'testing' | 'success' | 'error'
- `onTest`: (integrationKey: string) => void

**File:** `components/integrations/IntegrationTestButton.tsx`

---

### IntegrationSettingsManagerLazy

**Component Name:** IntegrationSettingsManagerLazy

**File:** `components/lazy/IntegrationSettingsManagerLazy.tsx`

---

## UI Components

### DataPointInputModal

**Component Name:** DataPointInputModal

**Props Interface:** DataPointInputModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `dataPoint`: StandardDataPoint
- `onComplete`: (proofs: any[], userData: any) => void

**File:** `components/DataPointInputModal.tsx`

---

### DataPointProposalModal

**Component Name:** DataPointProposalModal

**Props Interface:** DataPointProposalModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `onProposalSubmitted`: (proposalId: string) => void

**File:** `components/DataPointProposalModal.tsx`

---

### LicenseModal

**Component Name:** LicenseModal

**Props Interface:** LicenseModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `onLicensePurchased`: (licenseKey: string) => void

**File:** `components/LicenseModal.tsx`

---

### MigrationModal

**Component Name:** MigrationModal

**Props Interface:** MigrationModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `pendingIdentities`: WebIdentityData[]
- `onMigrationComplete`: (result: MigrationResult) => void

**File:** `components/MigrationModal.tsx`

---

### NotificationsButton

**Props Interface:** NotificationsButton

**Props:**

**File:** `components/NotificationsButton.tsx`

---

### ToolSettingsModal

**Component Name:** ToolSettingsModal

**Props Interface:** ToolSettingsModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `toolId`: string
- `settings`: GlobalPrivacySettings
- `onSettingsChange`: (settings: GlobalPrivacySettings) => void

**File:** `components/ToolSettingsModal.tsx`

---

### VerificationModal

**Component Name:** VerificationModal

**Props Interface:** VerificationModal

**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `dataPointId`: string
- `dataPointName`: string
- `verificationType`: 'email' | 'phone' | 'location'
- `target`: string
- `identityId`: string
- `onVerificationComplete`: (success: boolean, verifiedData: any) => void

**File:** `components/VerificationModal.tsx`

---

### ApiKeyInput

**Component Name:** ApiKeyInput

**Props Interface:** ApiKeyInput

**Props:**
- `apiKey`: ApiKey
- `value`: string
- `showPassword`: boolean
- `onChange`: (value: string) => void
- `onTogglePassword`: () => void

**File:** `components/integrations/ApiKeyInput.tsx`

---

### DataPointProposalModalLazy

**Component Name:** DataPointProposalModalLazy

**File:** `components/lazy/DataPointProposalModalLazy.tsx`

---

### LicenseModalLazy

**Component Name:** LicenseModalLazy

**File:** `components/lazy/LicenseModalLazy.tsx`

---

### ToolSettingsModalLazy

**Component Name:** ToolSettingsModalLazy

**File:** `components/lazy/ToolSettingsModalLazy.tsx`

---

### CryptoPaymentModal

**Component Name:** CryptoPaymentModal

**Props Interface:** CryptoPaymentModal

**Props:**
- `isOpen`: boolean
- `paymentRequest`: CoinbaseCheckout | null
- `onClose`: () => void
- `bgColor`: string
- `borderColor`: string
- `textColor`: string
- `secondaryTextColor`: string
- `isDark`: boolean

**File:** `components/license/CryptoPaymentModal.tsx`

---

### DetectionModal

**Component Name:** DetectionModal

**Props Interface:** DetectionModal

**Props:**
- `isOpen`: boolean
- `usagePattern`: UsagePattern | null
- `onClose`: () => void
- `onUpgrade`: () => void

**File:** `components/license/DetectionModal.tsx`

---

### LicenseModalFooter

**Component Name:** LicenseModalFooter

**Props Interface:** LicenseModalFooter

**Props:**
- `isProcessing`: boolean
- `onPurchase`: () => void
- `onCancel`: () => void
- `isDark`: boolean

**File:** `components/license/LicenseModalFooter.tsx`

---

### LicenseModalHeader

**Component Name:** LicenseModalHeader

**Props Interface:** LicenseModalHeader

**Props:**
- `onClose`: () => void

**File:** `components/license/LicenseModalHeader.tsx`

---

### UrlInput

**Component Name:** UrlInput

**Props Interface:** UrlInput

**Props:**
- `pictureUrl`: string
- `onUrlChange`: (url: string) => void

**File:** `components/profile/UrlInput.tsx`

---

### TransferPasscodeInput

**Component Name:** TransferPasscodeInput

**Props Interface:** TransferPasscodeInput

**Props:**
- `transferPasscode`: string
- `onPasscodeChange`: (passcode: string) => void
- `loading`: boolean

**File:** `components/transfer/TransferPasscodeInput.tsx`

---

## Page Components

### DeveloperPortal.refactored

**Component Name:** DeveloperPortal

**File:** `pages/DeveloperPortal.refactored.tsx`

---

### DeveloperPortal

**Component Name:** DeveloperPortal

**File:** `pages/DeveloperPortal.tsx`

---

### SDKDocumentation

**Component Name:** SDKDocumentation

**File:** `pages/SDKDocumentation.tsx`

---

### SyncReceiver

**Component Name:** SyncReceiver

**Props Interface:** SyncReceiver

**Props:**
- `syncCode`: string

**File:** `pages/SyncReceiver.tsx`

---

### TermsOfService

**File:** `pages/TermsOfService.tsx`

---

### TransferReceiver.refactored

**Props Interface:** TransferReceiver

**Props:**
- `transferId`: string
- `onClose`: () => void

**File:** `pages/TransferReceiver.refactored.tsx`

---

### TransferReceiver

**Props Interface:** TransferReceiver

**Props:**
- `transferId`: string
- `onClose`: () => void

**File:** `pages/TransferReceiver.tsx`

---

