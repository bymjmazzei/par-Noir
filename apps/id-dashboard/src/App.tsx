/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { CheckCircle, Smartphone, RefreshCw, FileText, PartyPopper, QrCode, MessageSquare, Phone, AlertTriangle, Info, Monitor, Edit3, Settings, ChevronUp, ChevronDown } from 'lucide-react';
import Header from './components/Header';
import { QRCodeManager } from './utils/qrCode';
import { SecureStorage } from './utils/storage';
import { UnifiedAuth } from './components/UnifiedAuth';
import { Logo } from './components/Logo';
import QRCode from 'qrcode';

import { IdentityCrypto, AuthSession, EncryptedIdentity } from './utils/crypto';

import { analytics } from './utils/analytics';
import { security } from './utils/security';
import usePWA from './hooks/usePWA';
import { GlobalPrivacySettings } from './types/privacy';

import { MigrationManager, WebIdentityData, MigrationResult } from './utils/migration';

import { BiometricAuth } from './utils/biometric';

import { cloudSyncManager } from './utils/cloudSync';
import { SecureMetadataStorage } from './utils/secureMetadataStorage';
import { notificationsService } from './utils/notificationsService';

import { InputValidator } from './utils/validation';
import { DevelopmentModeIndicator } from './components/DevelopmentModeIndicator';
import SimpleStorage, { SimpleIdentity } from './utils/simpleStorage';
import IdentitySelector from './components/IdentitySelector';
import IPFSStatus from './components/IPFSStatus';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ThemeAwareProfileImage } from './components/ThemeAwareProfileImage';
import { DeveloperPortal } from './pages/DeveloperPortal';

// Lazy load heavy components
const EnhancedPrivacyPanel = lazy(() => import('./components/EnhancedPrivacyPanel').then(module => ({ default: module.EnhancedPrivacyPanel })));
const ToolSettingsModal = lazy(() => import('./components/ToolSettingsModal').then(module => ({ default: module.ToolSettingsModal })));
const SecurityDashboard = lazy(() => import('./components/SecurityDashboard').then(module => ({ default: module.SecurityDashboard })));
const SessionManager = lazy(() => import('./components/SessionManager').then(module => ({ default: module.SessionManager })));
const RealtimeSecurityAlerts = lazy(() => import('./components/RealtimeSecurityAlerts').then(module => ({ default: module.RealtimeSecurityAlerts })));
const MigrationModal = lazy(() => import('./components/MigrationModal').then(module => ({ default: module.MigrationModal })));
const ProfilePictureEditor = lazy(() => import('./components/ProfilePictureEditor').then(module => ({ default: module.ProfilePictureEditor })));
const BiometricSetup = lazy(() => import('./components/BiometricSetup').then(module => ({ default: module.BiometricSetup })));
const PWALockScreen = lazy(() => import('./components/PWALockScreen').then(module => ({ default: module.default })));

// Loading component for lazy-loaded components
const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

interface DIDInfo {
  id: string;
  pnName: string;
  createdAt: string;
  status: string;
  displayName?: string;
  email?: string;
  nickname?: string;
  phone?: string;
  recoveryEmail?: string;
  recoveryPhone?: string;
  custodiansRequired: boolean;
  custodiansSetup: boolean;
  profilePicture?: string; // URL or base64 data URI
  isEncrypted?: boolean; // Flag to indicate if this identity is encrypted
  fileContent?: string; // Store file content for encrypted identities
  publicKey?: string; // Public key for encrypted identities
  filePath?: string; // File path for PWA identity references
  fileName?: string; // File name for PWA identity references
  idFile?: any; // Complete ID file for PWA stored identities
}

interface RecoveryCustodian {
  id: string;
  identityId: string;
  name: string;
  type: 'person' | 'service' | 'self';
  status: 'active' | 'pending';
  addedAt: string;
  lastVerified?: string;
  canApprove: boolean;
  contactType: 'email' | 'phone';
  contactValue: string;
}

interface RecoveryRequest {
  id: string;
  requestingDid: string;
  requestingUser: string;
  timestamp: string;
  status: 'pending' | 'approved' | 'denied';
  approvals: string[];
  denials: string[];
  claimantContactType?: 'email' | 'phone';
  claimantContactValue?: string;
}

interface RecoveryKey {
  id: string;
  identityId: string;
  keyData: string;
  createdAt: string;
  lastUsed?: string;
  purpose: 'personal' | 'legal' | 'insurance' | 'will';
  description?: string;
}

interface SyncedDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'other';
  lastSync: string;
  status: 'active' | 'inactive';
  location?: string;
  ipAddress?: string;
  isPrimary: boolean; // New: marks the primary device
  deviceFingerprint: string; // New: unique device identifier
  syncKey: string; // New: encrypted key for device-to-device sync
  pairedAt: string; // New: when device was paired
}



interface CustodianInvitationForm {
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
}

interface DeviceSyncData {
  deviceId: string;
  deviceName: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'other';
  syncKey: string;
  identityId: string;
  expiresAt: string;
  qrCodeDataURL: string;
}

function App() {
  // Production-safe logging utility
  const logDebug = (_message: string, ..._args: unknown[]) => {
    // Silent in production - no logging
  };

  const logError = (_message: string, ..._args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') {
      // This is intentionally empty in production
    }
  };

  const [storage] = useState(() => new SecureStorage());
  const [dids, setDids] = useState<DIDInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  

  

  
  // Function to handle success messages with proper timeout management
  const showSuccessMessage = (message: string, duration: number = 3000) => {
    console.log('showSuccessMessage called with:', message, 'duration:', duration);
    
    // Clear any existing timeout
    if (successTimeoutRef.current) {
      console.log('Clearing existing timeout');
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    
    // Set the success message
    console.log('Setting success message:', message);
    setSuccess(message);
    
    // Set new timeout with a unique identifier
    const timeoutId = setTimeout(() => {
      console.log('Timeout fired for message:', message);
      // Only clear if this is still our active timeout
      if (successTimeoutRef.current === timeoutId) {
        console.log('Clearing success message:', message);
        setSuccess(null);
        successTimeoutRef.current = null;
      } else {
        console.log('Timeout was superseded, not clearing');
      }
    }, duration);
    
    successTimeoutRef.current = timeoutId;
    console.log('Set timeout for:', duration, 'ms, timeoutId:', timeoutId);
  };
  
  // Override setSuccess to use our timeout management
  const setSuccessWithTimeout = (message: string | null) => {
    if (message === null) {
      // If clearing, also clear the timeout
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      setSuccess(null);
    } else {
      // If setting a message, use our timeout management
      showSuccessMessage(message);
    }
  };
  
  // Function to handle error messages with proper timeout management
  const showErrorMessage = (message: string, duration: number = 5000) => {
    setError(message);
    setTimeout(() => setError(null), duration);
  };
  
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);
  const [activeTab, setActiveTab] = useState<'privacy' | 'devices' | 'recovery' | 'export' | 'security' | 'developer'>('privacy');

  const [showUnifiedAuth, setShowUnifiedAuth] = useState(false);

  // PWA functionality
  const [pwaState, pwaHandlers] = usePWA();
  
  // PWA Lock Screen state
  const [isPWALocked, setIsPWALocked] = useState(false);
  
  // Debug PWA lock state
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('PWA Lock State:', isPWALocked);
    }
  }, [isPWALocked]);

  // Redirect away from developer tab if in PWA mode
  useEffect(() => {
    if (pwaState.isInstalled && activeTab === 'developer') {
      setActiveTab('privacy');
    }
  }, [pwaState.isInstalled, activeTab]);

  
  // Log PWA state for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
            logDebug('PWA State:', pwaState);
  }
  
  // Use real storage for data export/import
  const handleExportData = async () => {
    try {
      await storage.init();
      
      // Debug logging
      logDebug('Export attempt - authenticatedUser:', !!authenticatedUser);
      logDebug('Export attempt - selectedDID:', selectedDID);
      logDebug('Export attempt - authenticatedUser structure:', authenticatedUser);
      logDebug('Export attempt - selectedDID structure:', selectedDID);
      
      // Only export if user is authenticated and has a selected identity
      if (!authenticatedUser || !selectedDID) {
        throw new Error('No identity is currently unlocked. Please unlock an identity first.');
      }
      
      // Export only the currently unlocked identity
      // Use authenticatedUser data which has the correct publicKey
      const identityKey = authenticatedUser.publicKey || selectedDID?.publicKey || selectedDID?.id;
      logDebug('Looking for unlocked identity with key:', identityKey);
      logDebug('Authenticated user publicKey:', authenticatedUser.publicKey);
      logDebug('SelectedDID publicKey:', selectedDID?.publicKey);
      logDebug('SelectedDID id:', selectedDID?.id);
      
      // Also check what's actually in storage
      const simpleStorage = SimpleStorage.getInstance();
      const allStoredIdentities = await simpleStorage.getIdentities();
      logDebug('All stored identities:', allStoredIdentities.map(id => ({ id: id.id, nickname: id.nickname })));
      const currentIdentity = await simpleStorage.getIdentity(identityKey);
      logDebug('Found unlocked identity:', !!currentIdentity);
      
      if (!currentIdentity) {
        throw new Error('Unlocked identity not found in storage. Please unlock your identity again.');
      }
      
      // Export ONLY the encrypted data, not the plain text metadata
      // The encrypted data contains all the sensitive information
      const identityToExport = currentIdentity.encryptedData;
      
      // Verify this is actually encrypted data
      if (!identityToExport.encryptedData || !identityToExport.iv || !identityToExport.salt) {
        throw new Error('Invalid encrypted data structure');
      }
      
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [identityToExport] // Only export the encrypted identity data
      };
      const exportedData = JSON.stringify(exportData, null, 2);
      
      // Parse the exported data to get identity info for filename
      let filename = 'identity-backup.json';
      try {
        const parsedData = JSON.parse(exportedData);
        logDebug('Exported data structure:', Object.keys(parsedData));
        
        // Use the current session's nickname for the filename
        let nickname = 'identity';
        if (authenticatedUser && authenticatedUser.nickname) {
          nickname = authenticatedUser.nickname;
          logDebug('Using current session nickname for filename:', nickname);
        } else {
          logDebug('No nickname available, using default');
        }
        
        // Clean nickname for filename (remove special chars, limit length)
        const cleanNickname = nickname
          .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
          .replace(/\s+/g, '-') // Replace spaces with dashes
          .toLowerCase()
          .substring(0, 20); // Limit length
        
        logDebug('Clean nickname for filename:', cleanNickname);
        filename = `${cleanNickname}-backup.json`;
      } catch (parseError) {
        logDebug('Could not parse exported data for filename, using default');
        logError('Parse error:', parseError);
      }
      
      logDebug('Final filename:', filename);
      
      // Create download link
      const blob = new Blob([exportedData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showSuccessMessage('Data exported successfully', 5000);
    } catch (error) {
      logError('Export error:', error);
      showErrorMessage(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  const [authenticatedUser, setAuthenticatedUser] = useState<any>(null);
  
  // Debug success state changes
  useEffect(() => {
    console.log('Success state changed to:', success, 'authenticatedUser:', !!authenticatedUser);
  }, [success, authenticatedUser]);
  
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showAddCustodianModal, setShowAddCustodianModal] = useState(false);
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [custodianQRCode, setCustodianQRCode] = useState<string>('');
  const [custodianContactInfo, setCustodianContactInfo] = useState({
    name: '',
    contactType: 'email' as 'email' | 'phone',
    contactValue: '',
    type: 'person' as 'person' | 'service' | 'self'
  });
  const [showRecoveryKeyInputModal, setShowRecoveryKeyInputModal] = useState(false);
  const [recoveryThreshold, setRecoveryThreshold] = useState(2);
  const [custodians, setCustodians] = useState<RecoveryCustodian[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([]);
  const [recoveryKeys, setRecoveryKeys] = useState<RecoveryKey[]>([]);
  
  // Add missing state variables for identity management
  // const [identities, setIdentities] = useState<DIDInfo[]>([]);
  // const [newIdentityName, setNewIdentityName] = useState('');
  
  // Add missing identity manager
  // const [identityManager] = useState(() => new SecureStorage());
  
  // Enhanced Privacy Settings
  const [showEnhancedPrivacyPanel, setShowEnhancedPrivacyPanel] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<GlobalPrivacySettings>({
    allowAllToolAccess: false,
    allowAnalytics: false,
    allowMarketing: false,
    allowThirdPartySharing: false,
    dataPoints: {},
    toolPermissions: {}
  });
  
  // Security Dashboard
  const [showSecurityDashboard, setShowSecurityDashboard] = useState(false);
  const [showAdvancedSecuritySettings, setShowAdvancedSecuritySettings] = useState(false);
  
  // Session Manager
  const [showSessionManager, setShowSessionManager] = useState(false);
  
  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: 30, // minutes
    maxConcurrentSessions: 3,
    requireBiometric: false,
    enableNotifications: true,
    autoLockTimeout: 5, // minutes
    allowRememberMe: true
  });

  // Real-time Security Alerts
  const [showRealtimeSecurityAlerts, setShowRealtimeSecurityAlerts] = useState(false);

  // Migration states
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [pendingMigrations, setPendingMigrations] = useState<WebIdentityData[]>([]);
  const [migrationChecked, setMigrationChecked] = useState(false);
  

  
  // Tool Settings Modal
  const [showToolSettingsModal, setShowToolSettingsModal] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string>('');
  const [custodianships, setCustodianships] = useState<Array<{
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  }>>([]);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [activeRecoveryMethod, setActiveRecoveryMethod] = useState<'key' | 'factor'>('factor');
  const [recoveryKeyContactInfo, setRecoveryKeyContactInfo] = useState({
    contactType: 'email' as 'email' | 'phone',
    contactValue: '',
    claimantName: ''
  });
  const [syncedDevices, setSyncedDevices] = useState<SyncedDevice[]>([]);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);

  // Device syncing state
  const [deviceSyncData, setDeviceSyncData] = useState<DeviceSyncData | null>(null);
  const [showDeviceQRModal, setShowDeviceQRModal] = useState(false);

  const [currentDevice, setCurrentDevice] = useState<SyncedDevice | null>(null);

  // Recovery completion state
  const [showRecoveryCompleteModal, setShowRecoveryCompleteModal] = useState(false);
  const [recoveredDID, setRecoveredDID] = useState<DIDInfo | null>(null);

  // Custodian approval modal state
  const [showCustodianApprovalModal, setShowCustodianApprovalModal] = useState(false);
  const [selectedRecoveryRequest, setSelectedRecoveryRequest] = useState<RecoveryRequest | null>(null);
  const [selectedCustodianship, setSelectedCustodianship] = useState<{
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  } | null>(null);

  // Custodian invitation acceptance state
  const [showCustodianInvitationModal, setShowCustodianInvitationModal] = useState(false);
  const [showDeviceInfoModal, setShowDeviceInfoModal] = useState(false);
  const [pendingCustodianInvitation, setPendingCustodianInvitation] = useState<{
    invitationId: string;
    custodianName: string;
    custodianType: 'self-recovery' | 'person' | 'service';
    contactType: 'email' | 'phone';
    contactValue: string;
    identityName: string;
    identityUsername: string;
  } | null>(null);
  
  // New state for sending invitations
  const [showSendInvitationModal, setShowSendInvitationModal] = useState(false);
  const [selectedCustodianForInvitation, setSelectedCustodianForInvitation] = useState<RecoveryCustodian | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    pnName: '',
    confirmPNName: '',
    passcode: '',
    confirmPasscode: '',
    email: '',
    phone: '',
    recoveryEmail: '',
    confirmRecoveryEmail: '',
    recoveryPhone: '',
    confirmRecoveryPhone: '',
    recoveryContactType: 'email' as 'email' | 'phone'
  });
  
  const [createStep, setCreateStep] = useState(1);

  const [importForm, setImportForm] = useState({
    pnName: '',
    passcode: '',
    backupFile: null as File | null
  });

  const [recoveryKeyForm, setRecoveryKeyForm] = useState({
    purpose: 'personal' as RecoveryKey['purpose'],
    description: ''
  });

  // Main screen form state
  const [mainForm, setMainForm] = useState({
    pnName: '',
    passcode: '',
    uploadFile: null as File | null
  });
  
  // PWA-specific state for uploaded IDs
  // Removed uploadedIds state as it's now handled by the enhanced identity selector
  
  // Identity selector state
  const [selectedStoredIdentity, setSelectedStoredIdentity] = useState<SimpleIdentity | null>(null);
  
  // Onboarding wizard state
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  

  
  // Profile picture editing state
  const [showProfilePictureEditor, setShowProfilePictureEditor] = useState(false);
  
  // Nickname editing state
  const [showNicknameEditor, setShowNicknameEditor] = useState(false);
  const [editingNickname, setEditingNickname] = useState('');
  
  // Biometric authentication state
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  // const [biometricAvailable, setBiometricAvailable] = useState(false);
  
  // selectedId state removed as it's now handled by enhanced identity selector

  // Helper functions for custodian counts
  const getSelfCustodiansCount = () => {
    return custodians.filter(c => c.type === 'person' && c.identityId === authenticatedUser?.id).length;
  };

  const getThirdPartyCustodiansCount = () => {
    return custodians.filter(c => c.type === 'person' && c.identityId !== authenticatedUser?.id).length;
  };

  // Initialize systems
  useEffect(() => {
    console.log('App component initialized!');
    const initializeSystems = async () => {
      try {
        // Initialize analytics
        await analytics.initialize();
        
              // Initialize realtime manager (disabled in dev mode)
      // await realtimeManager.connect();
        
        // Initialize notifications service
        await notificationsService.initialize();
        

        
        // Track page view
        analytics.trackPageView('dashboard');

        // Check for migration needs (PWA only)
        if (!migrationChecked) {
          await checkForMigration();
          setMigrationChecked(true);
        }
      } catch (error) {
        logError('Failed to initialize systems:', error);
      }
    };

    initializeSystems();
  }, [migrationChecked]);

  const handleOfflineModeChange = () => {
    // This function is no longer needed since we removed the offline mode state
  };

  // Migration check function
  const checkForMigration = async () => {
    try {
      if (await MigrationManager.isMigrationNeeded()) {
        const pendingIdentities = await MigrationManager.getPendingMigrations();
        if (pendingIdentities.length > 0) {
          setPendingMigrations(pendingIdentities);
          setShowMigrationModal(true);
          logDebug(`Found ${pendingIdentities.length} identities to migrate`);
        }
      }
    } catch (error) {
              logError('Migration check failed:', error);
    }
  };

  // Handle migration completion
  const handleMigrationComplete = (result: MigrationResult) => {
    if (result.success && result.migratedCount > 0) {
      setSuccess(`Successfully migrated ${result.migratedCount} identity(ies) to PWA storage!`);
      setTimeout(() => setSuccess(null), 5000);
      
      // Refresh the app to load migrated identities
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else if (result.errors.length > 0) {
      setError(`Migration completed with ${result.errors.length} error(s). Some identities may not have been migrated.`);
      setTimeout(() => setError(null), 8000);
    }
    
    setShowMigrationModal(false);
  };

  const handleCreateDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      logDebug('Starting identity creation...');
      setLoading(true);
      setError(null);

      // Comprehensive input validation
      const pnNameValidation = InputValidator.validatePNName(createForm.pnName);
      if (!pnNameValidation.isValid) {
        setError(`pN Name validation failed: ${pnNameValidation.errors.join(', ')}`);
        analytics.trackError(new Error(`pN Name validation failed: ${pnNameValidation.errors.join(', ')}`), 'create-form', 'high');
        return;
      }



      const passcodeValidation = InputValidator.validatePasscode(createForm.passcode);
      if (!passcodeValidation.isValid) {
        setError(`Passcode validation failed: ${passcodeValidation.errors.join(', ')}`);
        analytics.trackError(new Error(`Passcode validation failed: ${passcodeValidation.errors.join(', ')}`), 'create-form', 'high');
        return;
      }

      // Validate optional fields
      if (createForm.recoveryEmail) {
        const emailValidation = InputValidator.validateEmail(createForm.recoveryEmail);
        if (!emailValidation.isValid) {
          setError(`Email validation failed: ${emailValidation.errors.join(', ')}`);
          return;
        }
      }

      if (createForm.recoveryPhone) {
        const phoneValidation = InputValidator.validatePhone(createForm.recoveryPhone);
        if (!phoneValidation.isValid) {
          setError(`Phone validation failed: ${phoneValidation.errors.join(', ')}`);
          return;
        }
      }

      // Rate limiting check
      const rateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
        keyGenerator: (userId?: string) => `create_identity_${userId || 'anonymous'}`
      };

      if (!security.checkRateLimit(rateLimitConfig)) {
        setError('Too many requests. Please wait a moment and try again.');
        return;
      }

      // Initialize storage if not already done
      try {
        await storage.init();
      } catch (error) {
        logError('Storage initialization error:', error);
        // Try to clear and reinitialize storage
        try {
          await storage.clearAllData();
          await storage.init();
        } catch (retryError) {
          logError('Storage retry failed:', retryError);
          throw new Error('Storage system error. Please clear your browser data and try again.');
        }
      }

      // Validate passcode confirmation
      if (createForm.passcode !== createForm.confirmPasscode) {
        throw new Error('Passcodes do not match');
      }

      // Validate recovery contact is provided
      if (createForm.recoveryContactType === 'email' && !createForm.recoveryEmail) {
        throw new Error('Recovery email is required');
      }
      if (createForm.recoveryContactType === 'phone' && !createForm.recoveryPhone) {
        throw new Error('Recovery phone is required');
      }

      // Validate confirmation fields match
      if (createForm.pnName !== createForm.confirmPNName) {
        throw new Error('pN Names do not match');
      }
      

      
      if (createForm.recoveryContactType === 'email' && createForm.recoveryEmail !== createForm.confirmRecoveryEmail) {
        throw new Error('Recovery emails do not match');
      }
      
      if (createForm.recoveryContactType === 'phone' && createForm.recoveryPhone !== createForm.confirmRecoveryPhone) {
        throw new Error('Recovery phone numbers do not match');
      }

      // Create real identity with cryptography
      logDebug('Creating encrypted identity...');
      const encryptedIdentity = await IdentityCrypto.createIdentity(
        createForm.pnName,
        createForm.pnName, // Use pnName as nickname since nickname field is removed
        createForm.passcode,
        createForm.recoveryEmail ? createForm.recoveryEmail : undefined,
        createForm.recoveryPhone ? createForm.recoveryPhone : undefined
      );
      logDebug('Encrypted identity created successfully');

      // Store encrypted identity using simple storage
      try {
        logDebug('Storing encrypted identity with public key:', encryptedIdentity.publicKey);
        
        const simpleStorage = SimpleStorage.getInstance();
        const simpleIdentity: SimpleIdentity = {
          id: encryptedIdentity.publicKey,
          nickname: createForm.pnName, // Use pnName as nickname since nickname field was removed
          pnName: createForm.pnName,
          publicKey: encryptedIdentity.publicKey,
          encryptedData: encryptedIdentity,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString()
        };
        
        await simpleStorage.storeIdentity(simpleIdentity);
        logDebug('Identity stored successfully in simple storage');

        // Store for migration if in web app mode
        MigrationManager.storeForMigration(encryptedIdentity);
      } catch (error) {
        logError('Storage error:', error);
        throw new Error('Failed to store identity. Please try again.');
      }

      // Recovery keys are now automatically generated and encrypted in the ID file
      // They will be available after decryption and can be linked to custodians in dashboard metadata

      // Create DID info for UI (all data is encrypted except public key)
      const didInfo: DIDInfo = {
        id: '', // ID is encrypted - will be filled after decryption
        pnName: '', // pN Name is encrypted - user must enter it
        email: '', // Email is encrypted
        nickname: '', // Nickname is encrypted
        phone: '', // Phone is encrypted
        recoveryEmail: '', // Recovery email is encrypted
        recoveryPhone: '', // Recovery phone is encrypted
        createdAt: '', // Created at is encrypted
        status: 'active', // Default status
        custodiansRequired: false, // Default value
        custodiansSetup: false // Default value
      };



      // Update the UI with the new identity
      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Authenticate the user immediately after identity creation
      try {
        const authSession = await IdentityCrypto.authenticateIdentity(encryptedIdentity, createForm.passcode, createForm.pnName);
        setAuthenticatedUser(authSession);
        setSuccess('PN created and authenticated successfully! Welcome to Par Noir.');
        
        // Trigger onboarding wizard for new users
        setIsNewUser(true);
        setShowOnboardingWizard(true);
      } catch (authError) {
        logError('Authentication error after creation:', authError);
        setError('PN created but authentication failed. Please try logging in.');
      }
      
      // Reset form
      setCreateForm({
        pnName: '',
        confirmPNName: '',
        passcode: '',
        confirmPasscode: '',
        email: '',
        phone: '',
        recoveryEmail: '',
        confirmRecoveryEmail: '',
        recoveryPhone: '',
        confirmRecoveryPhone: '',
        recoveryContactType: 'email'
      });
      setCreateStep(1);
      setShowCreateForm(false);
      setTimeout(() => setSuccess(null), 5000);
      
      // Track successful identity creation
      analytics.trackEvent('identity', 'created', 'success');
      analytics.trackFeatureUsage('identity_creation', 'completed');
    } catch (error: any) {
      logError('Create DID error:', error);
      setError(error.message || 'Failed to create DID');
      setTimeout(() => setError(null), 5000);
      
      // Track error
      analytics.trackError(error, 'create-form', 'medium');
      security.monitorAuthentication(false, createForm.pnName, 'identity_creation');
    } finally {
      setLoading(false);
    }
  };

  const handleImportDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Validate backup file
      if (!importForm.backupFile) {
        throw new Error('Please select a backup file to import');
      }

      // Read and parse backup file
      const backupData = await importForm.backupFile.text();
      const backup = JSON.parse(backupData);

      // Validate backup structure
      if (!backup.identities || !Array.isArray(backup.identities)) {
        throw new Error('Invalid backup file format');
      }

      // Find the identity to import
      const identityToImport = backup.identities.find((identity: any) => 
        identity.pnName === importForm.pnName
      );

      if (!identityToImport) {
        throw new Error('No matching PN found in backup file');
      }

      // Authenticate the identity
      const authSession = await IdentityCrypto.authenticateIdentity(
        identityToImport,
        importForm.passcode,
        importForm.pnName
      );

      // Store the session
      await storage.storeSession(authSession);

      // Create DID info for UI
      const didInfo: DIDInfo = {
        id: identityToImport.id,
        pnName: identityToImport.pnName,
        nickname: identityToImport.nickname,
        email: identityToImport.email || '',
        phone: identityToImport.phone || '',
        recoveryEmail: identityToImport.recoveryEmail || '',
        recoveryPhone: identityToImport.recoveryPhone || '',
        createdAt: identityToImport.createdAt,
        status: identityToImport.status,
        custodiansRequired: identityToImport.custodiansRequired,
        custodiansSetup: identityToImport.custodiansSetup
      };

      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Set authenticated user
      setAuthenticatedUser(authSession);
      
      // Reset form
      setImportForm({
        pnName: '',
        passcode: '',
        backupFile: null
      });
      setShowImportForm(false);
      setSuccess('PN imported and authenticated successfully!');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to import DID');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };



  const handleAuthSuccess = async (session: any) => {
    try {
      // Store the session using AuthSession interface
      await storage.storeSession({
        id: session.id,
        pnName: session.pnName,
        nickname: session.nickname,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        authenticatedAt: session.authenticatedAt,
        publicKey: session.publicKey || ''
      });

      // Set the authenticated user
      setAuthenticatedUser({
        id: session.id,
        pnName: session.pnName,
        nickname: session.nickname,
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        authenticatedAt: session.authenticatedAt,
        publicKey: session.publicKey || ''
      });

      // Set the unlocked identity for notifications
      notificationsService.setUnlockedIdentity(session.id, session.nickname || session.pnName);

      // Reload stored identities into the selector
      try {
        const storedIdentities = await storage.getIdentities();
        const didInfos: DIDInfo[] = storedIdentities.map((identity: any) => ({
          id: identity.id,
          pnName: identity.pnName,
          nickname: identity.nickname || identity.pnName,
          email: identity.email || '',
          phone: identity.phone || '',
          recoveryEmail: identity.recoveryEmail || '',
          recoveryPhone: identity.recoveryPhone || '',
          createdAt: identity.createdAt || new Date().toISOString(),
          status: identity.status || 'active',
          custodiansRequired: identity.custodiansRequired || false,
          custodiansSetup: identity.custodiansSetup || false,
          isEncrypted: identity.isEncrypted || false,
          fileContent: identity.fileContent || '',
          publicKey: identity.publicKey || '',
          filePath: identity.filePath || '',
          fileName: identity.fileName || '',
          idFile: identity.idFile || null
        }));
        
        setDids(didInfos);
        
        // Set the current user as selected
        const currentUser = didInfos.find(did => did.id === session.id);
        if (currentUser) {
          setSelectedDID(currentUser);
        }
        
        logDebug('Reloaded', didInfos.length, 'stored identities into selector');
      } catch (error) {
        logError('Failed to reload stored identities:', error);
      }

      // Close the modal and show success
    setShowUnifiedAuth(false);
    setError(null);
            showSuccessMessage(`Successfully unlocked identity: ${session.nickname || session.pnName}`, 5000);
    } catch (error: any) {
              logError('Failed to store session:', error);
      setError('Authentication succeeded but failed to store session. Please try again.');
    }
  };

  const handleAuthError = (error: Error) => {
            logError('Authentication failed:', error);
    setError(error.message);
    setTimeout(() => setError(null), 5000);
  };

  const handleLogout = async () => {
    try {
      logDebug('Logging out...');
      
      // Clear the current session from storage
      await storage.clearExpiredSessions();
      
      // Clear the unlocked identity for notifications
      notificationsService.clearUnlockedIdentity();
      
      // Clear all state
      setAuthenticatedUser(null);
      setDids([]);
      setSelectedDID(null);
      setSelectedStoredIdentity(null);
      setShowUnifiedAuth(false);
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      setError(null);
      setSuccess(null);
      setLoading(false);
      
      // Lock the PWA if it's installed
      if (pwaState.isInstalled) {
        setIsPWALocked(true);
        // Clear the last unlock time to force lock on next open
        localStorage.removeItem('pwa-last-unlock-time');
      }
      
      // Clear initialization flag so scan can run again on next app load
      localStorage.removeItem('pwa_initialized');
      localStorage.removeItem('pwa_directory_handle'); // Clean up old file system handles
      
      // Don't clear stored ID files - keep them for next login
              logDebug('Keeping stored identities for next login:', localStorage.getItem('pwa_stored_identities'));
      
              logDebug('Logout complete - all state cleared');
      showSuccessMessage('Successfully locked your identity', 5000);
    } catch (error) {
              logError('Error during logout:', error);
      // Force clear state even if storage fails
      setAuthenticatedUser(null);
      setDids([]);
      setSelectedDID(null);
      setSelectedStoredIdentity(null);
      setShowUnifiedAuth(false);
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      setError(null);
      setSuccess(null);
      setLoading(false);
      
      // Lock the PWA even if logout fails
      if (pwaState.isInstalled) {
        setIsPWALocked(true);
        localStorage.removeItem('pwa-last-unlock-time');
      }
    }
  };



  // Identity selector handlers
  const handleIdentitySelect = (identity: SimpleIdentity | null) => {
    setSelectedStoredIdentity(identity);
    if (identity) {
      // Auto-fill pnName when identity is selected
      setMainForm(prev => ({ ...prev, pnName: identity.pnName }));
      // Clear any uploaded file when selecting a stored identity
      setMainForm(prev => ({ ...prev, uploadFile: null }));
    }
  };



  const handleDeleteIdentity = async (identity: SimpleIdentity) => {
    try {
      const storage = SimpleStorage.getInstance();
      await storage.deleteIdentity(identity.id);
      
      // Clear selection if the deleted identity was selected
      if (selectedStoredIdentity?.id === identity.id) {
        setSelectedStoredIdentity(null);
        setMainForm(prev => ({ ...prev, pnName: '' }));
      }
      
      setSuccess(`Identity "${identity.nickname}" deleted successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      setError('Failed to delete identity');
      setTimeout(() => setError(null), 3000);
    }
  };



  const handleIncomingNicknameUpdate = async (identityId: string, newNickname: string) => {
    try {
              logDebug('Received nickname update for identity:', identityId, 'new nickname:', newNickname);
      
      // Get the stored identity (identityId could be publicKey or ID)
      let storedIdentity = await storage.getIdentity(identityId);
      if (!storedIdentity) {
        logDebug('Identity not found in local storage, skipping nickname update');
        return;
      }
      
      // Create an EncryptedIdentity from the StoredIdentity with updated nickname
      const updatedIdentity: EncryptedIdentity = { 
        publicKey: storedIdentity.publicKey,
        encryptedData: storedIdentity.encryptedData,
        iv: storedIdentity.iv,
        salt: storedIdentity.salt
      };
      
      // Store the updated identity
      await storage.storeIdentity(updatedIdentity);
      
      // Update the authenticated user's nickname if this is the current user
      if (authenticatedUser && authenticatedUser.id === identityId) {
        const updatedUser = { ...authenticatedUser, nickname: newNickname };
        setAuthenticatedUser(updatedUser);
      }
      
      // Update the DID info
      setDids(prev => prev.map(did => 
        did.id === identityId 
          ? { ...did, displayName: newNickname, nickname: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === identityId) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      // Update the stored identity reference in localStorage
      try {
        const storedIdentities = localStorage.getItem('pwa_stored_identities');
        if (storedIdentities) {
          const stored = JSON.parse(storedIdentities);
          const identityIndex = stored.findIndex((item: any) => 
            item.publicKey === storedIdentity.publicKey || item.idFile?.id === identityId
          );
          
          if (identityIndex >= 0) {
            // Update the nickname in the stored reference
            stored[identityIndex].nickname = newNickname;
            localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
            logDebug('Updated nickname in stored identity reference (incoming):', newNickname);
          }
        }
      } catch (error) {
        logError('Failed to update stored identity reference (incoming):', error);
      }

      // Update cloud database with the incoming nickname change
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeNicknameUpdate({
          identityId,
          publicKey: storedIdentity.publicKey,
          oldNickname: authenticatedUser?.nickname || '',
          newNickname,
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Incoming nickname update stored in cloud database');
      } catch (error) {
        logError('Failed to store incoming nickname update in cloud:', error);
      }
      
              logDebug('Nickname updated from sync:', newNickname);
    } catch (error) {
              logError('Error handling incoming nickname update:', error);
    }
  };

  const handleNicknameUpdate = async (newNickname: string) => {
    if (!authenticatedUser) return;
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
      logDebug('Updating nickname for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // 🔐 SECURE METADATA UPDATE: Update nickname in encrypted metadata
      try {
        const identityId = authenticatedUser.id || authenticatedUser.publicKey;
        await SecureMetadataStorage.updateMetadataField(
          identityId,
          authenticatedUser.pnName,
          authenticatedUser.passcode, // From ID file credentials
          'nickname',
          newNickname
        );
        logDebug('Nickname updated in secure metadata');
      } catch (error) {
        logError('Failed to update secure metadata:', error);
        // Continue with local updates even if secure metadata fails
      }
      
      // Update the authenticated user's nickname
      const updatedUser = { ...authenticatedUser, nickname: newNickname };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, nickname: newNickname, displayName: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the nickname in the stored reference
              stored[identityIndex].nickname = newNickname;
              
              // Update the nickname in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.nickname = newNickname;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated nickname in PWA localStorage:', newNickname);
            } else {
              logDebug('Identity not found in PWA localStorage');
            }
          } else {
            logDebug('No PWA stored identities found');
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session nickname, user should re-upload ID file for permanent storage');
          } else {
            logDebug('Identity not found in web app storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store nickname update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'nickname',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldNickname: authenticatedUser.nickname || '',
            newNickname
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Nickname update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store nickname update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }
      
      setShowNicknameEditor(false);
      const successMessage = pwaState.isInstalled 
        ? 'Nickname updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Nickname updated successfully! Changes will sync to cloud and other platforms. Re-upload your PN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Error updating nickname:', error);
      showErrorMessage(`Failed to update nickname: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpdate = async (newProfilePicture: string) => {
    if (!authenticatedUser) return;
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
              logDebug('Updating profile picture for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // 🔐 SECURE METADATA UPDATE: Update profile picture in encrypted metadata
      try {
        const identityId = authenticatedUser.id || authenticatedUser.publicKey;
        await SecureMetadataStorage.updateMetadataField(
          identityId,
          authenticatedUser.pnName,
          authenticatedUser.passcode, // From ID file credentials
          'profilePicture',
          newProfilePicture
        );
        logDebug('Profile picture updated in secure metadata');
      } catch (error) {
        logError('Failed to update secure metadata:', error);
        // Continue with local updates even if secure metadata fails
      }
      
      // Update the authenticated user's profile picture
      const updatedUser = { ...authenticatedUser, profilePicture: newProfilePicture };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, profilePicture: newProfilePicture }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, profilePicture: newProfilePicture } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the profile picture in the stored reference
              stored[identityIndex].profilePicture = newProfilePicture;
              
              // Update the profile picture in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.profilePicture = newProfilePicture;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated profile picture in PWA localStorage:', newProfilePicture);
            } else {
              logDebug('Identity not found in PWA localStorage');
            }
          } else {
            logDebug('No PWA stored identities found');
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session profile picture, user should re-upload ID file for permanent storage');
          } else {
            logDebug('Identity not found in web app storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store profile picture update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'profile-picture',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldProfilePicture: authenticatedUser.profilePicture || '',
            newProfilePicture
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Profile picture update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store profile picture update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }
      
      setShowProfilePictureEditor(false);
      const successMessage = pwaState.isInstalled 
        ? 'Profile picture updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Profile picture updated successfully! Changes will sync to cloud and other platforms. Re-upload your PN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Profile picture update error:', error);
      setError('Failed to update profile picture');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateNickname = async (newNickname: string) => {
    if (!authenticatedUser) return;
    
    try {
      setLoading(true);
      
      const isPWAMode = pwaState.isInstalled;
      logDebug('Updating nickname for', isPWAMode ? 'PWA' : 'Web App', 'identity...');
      
      // Update the authenticated user's nickname
      const updatedUser = { ...authenticatedUser, nickname: newNickname };
      setAuthenticatedUser(updatedUser);
      
      // Update the DID info in state
      setDids(prev => prev.map(did => 
        did.id === authenticatedUser.id 
          ? { ...did, nickname: newNickname }
          : did
      ));
      
      // Update selected DID if it's the current user
      if (selectedDID?.id === authenticatedUser.id) {
        setSelectedDID(prev => prev ? { ...prev, nickname: newNickname } : null);
      }
      
      if (isPWAMode) {
        // PWA: Update localStorage storage
        try {
          const storedIdentities = localStorage.getItem('pwa_stored_identities');
          if (storedIdentities) {
            const stored = JSON.parse(storedIdentities);
            const identityIndex = stored.findIndex((item: any) => 
              item.publicKey === authenticatedUser.publicKey || item.idFile?.id === authenticatedUser.id
            );
            
            if (identityIndex >= 0) {
              // Update the nickname in the stored reference
              stored[identityIndex].nickname = newNickname;
              
              // Update the nickname in the actual ID file data
              if (stored[identityIndex].idFile) {
                stored[identityIndex].idFile.nickname = newNickname;
              }
              
              localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Updated nickname in PWA localStorage:', newNickname);
            }
          }
        } catch (error) {
          logError('Failed to update PWA stored identity reference:', error);
        }
      } else {
        // Web App: Update IndexedDB storage
        try {
          await storage.init();
          const storedIdentity = await storage.getIdentity(authenticatedUser.publicKey);
          if (storedIdentity) {
            logDebug('Web app: Updated session nickname, user should re-upload ID file for permanent storage');
          }
        } catch (error) {
          logError('Failed to update web app storage:', error);
        }
      }

      // Store nickname update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'nickname',
          identityId: authenticatedUser.id,
          publicKey: authenticatedUser.publicKey,
          data: {
            oldNickname: authenticatedUser.nickname || '',
            newNickname
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Nickname update stored in cloud database for cross-platform sync');
      } catch (error) {
        logError('Failed to store nickname update in cloud:', error);
      }
      
      const successMessage = pwaState.isInstalled 
        ? 'Nickname updated successfully! Changes will sync across all PWA devices and platforms.'
        : 'Nickname updated successfully! Changes will sync to cloud and other platforms. Re-upload your PN file to save changes permanently.';
      showSuccessMessage(successMessage);
    } catch (error) {
      logError('Nickname update error:', error);
      setError('Failed to update nickname');
      setTimeout(() => setError(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Biometric authentication handler (currently unused but available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleBiometricAuth = async (identity: DIDInfo) => {
    try {
      setLoading(true);
      
      // Attempt biometric authentication
      const result = await BiometricAuth.authenticate(identity.id);
      
      if (result.success) {
        // Get the stored identity
        const storedIdentity = await storage.getIdentity(identity.id);
        if (!storedIdentity) {
          throw new Error('Identity not found');
        }

        // Create authenticated session without requiring passcode
        const authSession = {
          id: identity.id,
          pnName: identity.pnName,
          nickname: identity.nickname || identity.pnName,
          accessToken: `biometric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          expiresIn: 3600,
          authenticatedAt: new Date().toISOString(),
          publicKey: 'biometric-auth-key'
        };

        // Store the session
        await storage.storeSession(authSession);
        
        // Set authenticated user
        setAuthenticatedUser(authSession);
        setSelectedDID(identity);
        
        setSuccess('Successfully unlocked with biometrics!');
        setTimeout(() => setSuccess(null), 3000);
      } else if (result.fallbackToPasscode) {
        // Fall back to passcode authentication
        setSelectedDID(identity);
        setMainForm(prev => ({ ...prev, pnName: identity.pnName }));
        setError(result.error || 'Biometric authentication failed. Please enter your passcode.');
        setTimeout(() => setError(null), 5000);
      } else {
        throw new Error(result.error || 'Biometric authentication failed');
      }
    } catch (error: any) {
              logError('Biometric authentication error:', error);
      setError(error.message || 'Biometric authentication failed');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricSetupSuccess = () => {
    setSuccess('Biometric authentication set up successfully!');
    setTimeout(() => setSuccess(null), 3000);
  };



  const handleMainFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!mainForm.pnName || !mainForm.passcode) {
      setError('Please enter both pnName and passcode');
      return;
    }
    
    // Check if we have either a stored identity selected or a file uploaded
    if (!selectedStoredIdentity && !mainForm.uploadFile) {
      setError('Please select an identity or upload a PN file');
      return;
    }
    
    // Handle file upload logic here OR selected identity reference
    if (mainForm.uploadFile || selectedStoredIdentity) {
              logDebug('Processing file upload or selected identity reference');
      
      try {
        setLoading(true);
        setError(null);

                // Get identity data - either from uploaded file or from stored identity
        let identityData: any;
        let identityToUnlock: any;
    if (mainForm.uploadFile) {
          const fileContent = await mainForm.uploadFile.text();
          logDebug('File content from upload, length:', fileContent.length);
          
          // Parse the file as JSON
          try {
            identityData = JSON.parse(fileContent);
            logDebug('Parsed identity data:', identityData);
            logDebug('File structure - has identities array:', !!identityData.identities);
            logDebug('File structure - identities length:', identityData.identities?.length);
            logDebug('File structure - keys:', Object.keys(identityData));
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
            throw new Error('Invalid file format. Please use a JSON PN file.');
          }
        } else if (selectedStoredIdentity?.encryptedData) {
          // Use stored identity data - it's already the decrypted identity object
          identityToUnlock = selectedStoredIdentity.encryptedData;
          logDebug('Using stored identity data for selected identity');
        } else {
          setError('Please upload the PN file to unlock this PN');
          setLoading(false);
          return;
        }

        // Handle different possible formats (only for file uploads, not stored identities)
        if (mainForm.uploadFile) {
          if (identityData.identities && Array.isArray(identityData.identities)) {
            // Backup format - should only have one identity
            if (identityData.identities.length === 1) {
              identityToUnlock = identityData.identities[0];
            } else {
              throw new Error('Invalid PN file: Multiple identities found. Each PN file should contain only one identity.');
            }
          } else if (identityData.id || identityData.pnName) {
            // Single identity format
            identityToUnlock = identityData;
          } else {
            throw new Error('Invalid PN file format');
          }
        }

        // Check if this is an encrypted identity
        logDebug('Checking identity type:', { 
          hasEncryptedData: !!identityToUnlock.encryptedData, 
          hasIV: !!identityToUnlock.iv, 
          hasSalt: !!identityToUnlock.salt 
        });
        
        if (identityToUnlock.encryptedData && identityToUnlock.iv && identityToUnlock.salt) {
          logDebug('Processing encrypted identity');
          logDebug('Attempting authentication with pnName:', mainForm.pnName);
          logDebug('Identity to unlock publicKey:', identityToUnlock.publicKey);
          
          // This is an encrypted identity, try to authenticate it
          let authSession;
          try {
            authSession = await IdentityCrypto.authenticateIdentity(
              identityToUnlock as any,
              mainForm.passcode,
              mainForm.pnName
            );
            logDebug('Authentication successful, auth session created:', authSession);
          } catch (authError) {
            logError('Authentication failed:', authError);
            throw new Error(`Authentication failed: ${authError instanceof Error ? authError.message : 'Invalid credentials'}`);
          }

          // Store the session
          logDebug('Auth session created:', authSession);
          await storage.storeSession(authSession);
          logDebug('Session stored:', authSession);

          // Use stored identity nickname or derive from filename
          let finalNickname = selectedStoredIdentity?.nickname;
          if (!finalNickname && mainForm.uploadFile?.name) {
            finalNickname = mainForm.uploadFile.name
              .replace(/\.json$/i, '')
              .replace(/\([0-9]+\)$/, '')
              .replace(/backup$/i, '')
              .replace(/identity$/i, '')
              .replace(/[-_]/g, ' ')
              .trim();
          }
          if (!finalNickname) {
            finalNickname = `Identity (${identityToUnlock.id.slice(-8)})`;
          }

          logDebug('Using nickname:', finalNickname);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityToUnlock.id,
            pnName: identityToUnlock.pnName,
            nickname: finalNickname,
            email: identityToUnlock.email || '',
            phone: identityToUnlock.phone || '',
            recoveryEmail: identityToUnlock.recoveryEmail || '',
            recoveryPhone: identityToUnlock.recoveryPhone || '',
            createdAt: identityToUnlock.createdAt || new Date().toISOString(),
            status: identityToUnlock.status || 'active',
            custodiansRequired: identityToUnlock.custodiansRequired || false,
            custodiansSetup: identityToUnlock.custodiansSetup || false
          };

          // Store the ID file using simple storage
          try {
            const simpleStorage = SimpleStorage.getInstance();
            const simpleIdentity: SimpleIdentity = {
              id: identityToUnlock.publicKey,
              nickname: finalNickname,
              pnName: identityToUnlock.pnName,
              publicKey: identityToUnlock.publicKey,
              encryptedData: identityToUnlock, // This is the decrypted data - we need to store the original encrypted data
              createdAt: new Date().toISOString(),
              lastAccessed: new Date().toISOString()
            };
            
            await simpleStorage.storeIdentity(simpleIdentity);
            logDebug('ID file stored using simple storage:', finalNickname);
            

            
            // Update the DID list to show the new identity
            setDids(prev => {
              const newDids = [...prev, {
                ...didInfo,
                idFile: identityToUnlock,
                fileName: mainForm.uploadFile?.name || 'stored-identity'
              }];
              return newDids;
            });
          } catch (error) {
            logError('Failed to store ID file:', error);
          }
          
          setDids(prev => {
            const newDids = [...prev, didInfo];
            return newDids;
          });
          setSelectedDID(didInfo);
          
          // Update the session with the correct nickname
          const updatedSession = {
            ...authSession,
            nickname: finalNickname
          };
          
          // Set authenticated user with correct nickname
          logDebug('Setting authenticated user:', updatedSession);
          setAuthenticatedUser(updatedSession);
          
          setSuccess('PN file unlocked successfully!');
          setTimeout(() => setSuccess(null), 5000);
        } else {
          console.log('Processing plain identity');
          // This appears to be a plain identity, but we need to validate credentials
          // Check if the pN Name matches the identity in the file
          if (identityToUnlock.pnName && identityToUnlock.pnName !== mainForm.pnName) {
            console.error('pN Name mismatch:', { filePNName: identityToUnlock.pnName, formPNName: mainForm.pnName });
            throw new Error('pN Name does not match the identity in the file');
          }
          
          // For plain identities, we should still require some form of validation
          // For now, we'll require the pN Name to match and create a proper session
          const session = {
            id: identityToUnlock.id || 'plain-id',
            pnName: identityToUnlock.pnName || mainForm.pnName,
            nickname: identityToUnlock.nickname || identityToUnlock.pnName || 'User',
            accessToken: 'token-' + Date.now(),
            expiresIn: 3600,
            authenticatedAt: new Date().toISOString(),
            publicKey: identityToUnlock.publicKey || ''
          };

          // Store the session
          await storage.storeSession(session);
          logDebug('Session stored (plain):', session);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityToUnlock.id || 'plain-id',
            pnName: identityToUnlock.pnName || mainForm.pnName,
            nickname: identityToUnlock.nickname || identityToUnlock.pnName || 'User',
            email: identityToUnlock.email || '',
            phone: identityToUnlock.phone || '',
            recoveryEmail: identityToUnlock.recoveryEmail || '',
            recoveryPhone: identityToUnlock.recoveryPhone || '',
            createdAt: identityToUnlock.createdAt || new Date().toISOString(),
            status: identityToUnlock.status || 'active',
            custodiansRequired: identityToUnlock.custodiansRequired || false,
            custodiansSetup: identityToUnlock.custodiansSetup || false
          };

          // Note: Plain identities are not stored in regular storage as they don't match EncryptedIdentity format
          logDebug('Plain identity processed - not stored in regular storage');
          

          
          // Identity already stored securely in encrypted format
          logDebug('Identity processed securely:', didInfo.id);
          
          setDids(prev => {
            const newDids = [...prev, didInfo];
            return newDids;
          });
          setSelectedDID(didInfo);
          
          // Set authenticated user
          setAuthenticatedUser(session);
          
          setSuccess('PN file unlocked successfully!');
          setTimeout(() => setSuccess(null), 5000);
        }
        
        // Clear the form
        setMainForm({ pnName: '', passcode: '', uploadFile: null });
        
        return; // Exit early since we handled the file upload
                      } catch (error: any) {
          console.error('File unlock error:', error);
          logError('File unlock error:', error);
          setError(`Failed to unlock identity: ${error.message || 'Unknown error'}`);
          setTimeout(() => setError(null), 5000);
      } finally {
        setLoading(false);
      }
      return; // Exit early since we handled the file upload
    }
    
    // If we get here, no file was uploaded, so try simple storage
    try {
      setLoading(true);
      setError(null);

      // Use simple storage
      const simpleStorage = SimpleStorage.getInstance();
      const identities = await simpleStorage.getIdentities();
      logDebug('Simple storage identities found:', identities.length);
      
      // Find the identity to unlock
      let foundIdentity = null;
      let decryptedIdentity = null;
      
      for (const identity of identities) {
        logDebug('Checking identity with pnName:', identity.pnName);
        try {
          // Try to decrypt and verify the identity
          decryptedIdentity = await IdentityCrypto.authenticateIdentity(
            identity.encryptedData, 
            mainForm.passcode, 
            mainForm.pnName
          );
          logDebug('Decrypted identity pnName:', decryptedIdentity.pnName);
          if (decryptedIdentity.pnName === mainForm.pnName) {
            logDebug('Found matching identity!');
            foundIdentity = identity;
            break;
          }
        } catch (error) {
          logError('Failed to decrypt identity:', error);
          // Continue to next identity
          continue;
        }
      }

      if (!foundIdentity || !decryptedIdentity) {
        throw new Error('No identity found with that pnName and passcode.');
      }

      // Create session
      const session: AuthSession = {
        id: decryptedIdentity.id,
        pnName: decryptedIdentity.pnName,
        nickname: decryptedIdentity.nickname,
        accessToken: `token_${Date.now()}`,
        expiresIn: 3600,
        authenticatedAt: new Date().toISOString(),
        publicKey: foundIdentity.publicKey
      };

      // Store the session
      await storage.storeSession(session);
      
      // Update state
      setAuthenticatedUser(session);
      setDids([{
        id: decryptedIdentity.id,
        pnName: decryptedIdentity.pnName,
        nickname: decryptedIdentity.nickname, // Set the actual nickname
        createdAt: decryptedIdentity.authenticatedAt,
        status: 'active',
        displayName: decryptedIdentity.nickname,
        custodiansRequired: true,
        custodiansSetup: false
      }]);
      
      // Clear the form
      setMainForm({ pnName: '', passcode: '', uploadFile: null });
      
      // Show success message with proper timeout management
      showSuccessMessage('Identity unlocked successfully!');
      
    } catch (error: any) {
              logError('Authentication error:', error);
      setError(error.message || 'Failed to unlock identity');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

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

      // Create recovery request
      const recoveryRequest: RecoveryRequest = {
        id: `recovery-${Date.now()}`,
        requestingDid: foundIdentity.publicKey, // Use public key since ID is encrypted
        requestingUser: recoveryData.pnName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        denials: []
      };

      setRecoveryRequests(prev => [...prev, recoveryRequest]);
      setShowRecoveryModal(false);
      setSuccess('Recovery request initiated! Notifying custodians...');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const generateCustodianQRCode = async (custodianData: CustodianInvitationForm) => {
    try {
      const invitationData = {
        invitationId: `inv-${Date.now()}`,
        invitationCode: `code-${Math.random().toString(36).substring(2)}`,
        custodianName: custodianData.name,
        custodianType: custodianData.type === 'self' ? 'self-recovery' : custodianData.type,
        contactType: custodianData.contactType,
        contactValue: custodianData.contactValue,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
        identityName: authenticatedUser?.nickname || 'Unknown Identity',
        identityUsername: authenticatedUser?.pnName || 'unknown'
      };
      
      // Create deep link for custodian invitation
      const deepLinkData = {
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
              logError('Failed to generate QR code:', error);
    }
  };

  const handleContactAction = (contactType: 'email' | 'phone', contactValue: string) => {
    if (contactType === 'email') {
      const subject = 'Identity Protocol - Custodian Invitation';
      const body = `You have been invited to be a recovery custodian for an identity. Please scan the QR code to accept the invitation.`;
      window.open(`mailto:${contactValue}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } else if (contactType === 'phone') {
      const message = 'You have been invited to be a recovery custodian. Please scan the QR code to accept the invitation.';
      window.open(`sms:${contactValue}?body=${encodeURIComponent(message)}`);
    }
  };

  const handleAddCustodian = async (custodianData: CustodianInvitationForm) => {
    try {
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
        contactValue: custodianData.contactValue
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

      setSuccess('Custodian added as pending! Use the "Send Invitation" button to generate and send the QR code. Changes will sync across platforms.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to add custodian');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Custodian validation handler (currently unused but available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCustodianValidation = async (custodianId: string) => {
    try {
      setCustodians(prev => prev.map(custodian => 
        custodian.id === custodianId 
          ? { 
              ...custodian, 
              status: 'active' as const,
              canApprove: true,
              lastVerified: new Date().toISOString()
            }
          : custodian
      ));
      
      setSuccess('Custodian validated successfully! They can now approve recovery requests.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to validate custodian');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleApproveRecovery = (requestId: string, custodianId: string) => {
    setRecoveryRequests(prev => {
      const updatedRequests = prev.map(req => 
        req.id === requestId 
          ? { ...req, approvals: [...req.approvals, custodianId] }
          : req
      );
      
      // Check if recovery threshold is met after this approval
      const updatedRequest = updatedRequests.find(req => req.id === requestId);
      if (updatedRequest && updatedRequest.approvals.length >= recoveryThreshold) {
        // Recovery successful - find the DID and show completion modal
        const foundDID = dids.find(did => did.id === updatedRequest.requestingDid);
        if (foundDID) {
          setRecoveredDID(foundDID);
          setShowRecoveryCompleteModal(true);
        }
      }
      
      return updatedRequests;
    });
    
    // Show success message if threshold not met yet
    const currentRequest = recoveryRequests.find(req => req.id === requestId);
    if (currentRequest && currentRequest.approvals.length + 1 < recoveryThreshold) {
      setSuccess('Recovery approved! Waiting for more custodians to approve...');
      setTimeout(() => setSuccess(null), 5000);
    }
  };

  // Recovery denial handler (currently unused but available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    
    setSuccess('Recovery denied.');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleGenerateRecoveryKey = async (purpose: RecoveryKey['purpose'], description?: string) => {
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Generate a cryptographically secure recovery key
      const keyData = await IdentityCrypto.generateRecoveryKey(
        authenticatedUser?.id || 'unknown',
        purpose
      );
      
      const recoveryKey: RecoveryKey = {
        id: `key-${Date.now()}`,
        identityId: authenticatedUser?.id || selectedDID?.id || 'unknown',
        keyData,
        createdAt: new Date().toISOString(),
        purpose,
        description
      };

      setRecoveryKeys(prev => [...prev, recoveryKey]);
      setShowRecoveryKeyModal(false);

      // Store recovery key update in cloud database for cross-platform sync
      try {
        await cloudSyncManager.initialize();
        await cloudSyncManager.storeUpdate({
          type: 'recovery-key',
          identityId: authenticatedUser?.id || selectedDID?.id || 'unknown',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'generate',
            recoveryKey
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
        logDebug('Recovery key update stored in cloud database for cross-platform sync');
      } catch (error) {
                  logError('Failed to store recovery key update in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      }

      setSuccess('Recovery key generated successfully! Download and store it securely. Changes will sync across platforms.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to generate recovery key');
      setTimeout(() => setError(null), 5000);
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

    setSuccess('Recovery key downloaded successfully!');
    setTimeout(() => setSuccess(null), 5000);
  };

  const handleInitiateRecoveryWithKey = async (recoveryKey: string, contactInfo: {
    contactType: 'email' | 'phone';
    contactValue: string;
    claimantName: string;
  }) => {
    try {
      setLoading(true);
      setError(null);

      // Validate contact information
      if (!contactInfo.claimantName.trim() || !contactInfo.contactValue.trim()) {
        throw new Error('Please provide claimant name and contact information.');
      }

      // Find the recovery key
      const key = recoveryKeys.find(k => k.keyData === recoveryKey);
      if (!key) {
        throw new Error('Invalid recovery key. Please check and try again.');
      }

      // Find the associated identity
      const foundDID = dids.find(did => did.id === key.identityId);
      if (!foundDID) {
        throw new Error('Identity not found for this recovery key.');
      }

      // Create recovery request with claimant details
      const recoveryRequest: RecoveryRequest = {
        id: `recovery-${Date.now()}`,
        requestingDid: foundDID.id,
        requestingUser: contactInfo.claimantName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        denials: [],
        claimantContactType: contactInfo.contactType,
        claimantContactValue: contactInfo.contactValue
      };

      setRecoveryRequests(prev => [...prev, recoveryRequest]);
      setShowRecoveryKeyInputModal(false);
      setRecoveryKeyInput('');
      setRecoveryKeyContactInfo({
        contactType: 'email',
        contactValue: '',
        claimantName: ''
      });
      setSuccess(`Recovery initiated by ${contactInfo.claimantName}! Notifying custodians...`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to initiate recovery with key');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCustodian = (custodianId: string) => {
    const removedCustodian = custodians.find(c => c.id === custodianId);
    setCustodians(prev => prev.filter(c => c.id !== custodianId));

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

    setSuccess('Custodian removed successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccess(null), 5000);
  };

  // Tool Settings Handlers
  const handleOpenToolSettings = (toolId: string) => {
    setSelectedToolId(toolId);
    setShowToolSettingsModal(true);
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

    setSuccess('Tool status updated successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccess(null), 5000);
  };



  const handleAddDevice = async (deviceData: {
    name: string;
    type: 'mobile' | 'desktop' | 'tablet' | 'other';
  }) => {
    try {
      const syncData = await createDeviceQRData(deviceData);
      setDeviceSyncData(syncData);
      setShowDeviceQRModal(true);
    } catch (error: any) {
      setError(error.message || 'Failed to generate device sync data');
    }
  };

  const handleRemoveDevice = (deviceId: string) => {
    const removedDevice = syncedDevices.find(d => d.id === deviceId);
    setSyncedDevices(prev => prev.filter(device => device.id !== deviceId));

    // Store device removal in cloud database for cross-platform sync
    if (removedDevice) {
      cloudSyncManager.initialize().then(() => {
        return cloudSyncManager.storeUpdate({
          type: 'device',
          identityId: authenticatedUser?.id || selectedDID?.id || 'temp-identity',
          publicKey: authenticatedUser?.publicKey || '',
          data: {
            action: 'remove',
            deviceId,
            device: removedDevice
          },
          updatedByDeviceId: currentDevice?.id || generateDeviceFingerprint()
        });
      }).then(() => {
        logDebug('Device removal stored in cloud database for cross-platform sync');
      }).catch((error) => {
                  logError('Failed to store device removal in cloud:', error);
        // Don't fail the entire operation if cloud sync fails
      });
    }

    setSuccess('Device removed successfully. Changes will sync across platforms.');
    setTimeout(() => setSuccess(null), 5000);
  };

  // Device syncing utility functions
  const generateDeviceFingerprint = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '16px Arial';
      ctx.fillText('Device Fingerprint', 10, 20);
      return canvas.toDataURL().slice(0, 50) + Date.now().toString();
    }
    return `device-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  };

  // Check for cloud updates and sync them to PWA
  const checkForCloudUpdates = async () => {
    try {
      logDebug('Checking for cloud updates...');
      
      // 🔄 SYNC PENDING METADATA: Sync offline changes to cloud
      const pendingSync = SecureMetadataStorage.getPendingSync();
      if (Object.keys(pendingSync).length > 0) {
        logDebug('Found pending metadata sync items:', Object.keys(pendingSync).length);
        const syncResult = await SecureMetadataStorage.syncPendingToCloud();
        if (syncResult.synced > 0) {
          setSuccess(`Synced ${syncResult.synced} offline changes to cloud`);
          setTimeout(() => setSuccess(null), 3000);
        }
      }
      
      // Get stored identities from PWA localStorage
      const storedIdentities = localStorage.getItem('pwa_stored_identities');
      if (!storedIdentities) {
        logDebug('No PWA identities to check for updates');
        return;
      }
      
      const stored = JSON.parse(storedIdentities);
      
      // Check each stored identity for cloud updates
      for (const identity of stored) {
        if (identity.publicKey) {
          try {
            const cloudUpdates = await cloudSyncManager.getUpdates(identity.publicKey);
            
            // Process each type of update
            for (const update of cloudUpdates) {
              // Check if this update is newer than our local version
              const localLastUpdated = identity.lastAccessed || identity.createdAt;
              const cloudLastUpdated = update.updatedAt;
              
              if (new Date(cloudLastUpdated) > new Date(localLastUpdated)) {
                logDebug('Found cloud update for identity:', identity.publicKey, 'type:', update.type);
                
                switch (update.type) {
                  case 'nickname':
                    if (identity.nickname !== update.data.newNickname) {
                      identity.nickname = update.data.newNickname;
                      if (identity.idFile) {
                        identity.idFile.nickname = update.data.newNickname;
                      }
                      logDebug('Updated local nickname from cloud:', update.data.newNickname);
                    }
                    break;
                    
                  case 'profile-picture':
                    if (identity.profilePicture !== update.data.newProfilePicture) {
                      identity.profilePicture = update.data.newProfilePicture;
                      if (identity.idFile) {
                        identity.idFile.profilePicture = update.data.newProfilePicture;
                      }
                      logDebug('Updated local profile picture from cloud:', update.data.newProfilePicture);
                    }
                    break;
                    
                  case 'custodian':
                    // Note: Custodian updates would need to be handled by the main app state
                    // This is just for logging - actual sync would happen in the main component
                    logDebug('Found custodian update from cloud:', update.data.action, update.data.custodian?.name);
                    break;
                    
                  case 'recovery-key':
                    // Note: Recovery key updates would need to be handled by the main app state
                    logDebug('Found recovery key update from cloud:', update.data.action);
                    break;
                    
                  case 'device':
                    // Note: Device updates would need to be handled by the main app state
                    logDebug('Found device update from cloud:', update.data.action, update.data.device?.name);
                    break;
                    
                  case 'privacy':
                    // Note: Privacy updates would need to be handled by the main app state
                    logDebug('Found privacy settings update from cloud:', update.data.action, update.data.toolId);
                    break;
                }
              }
            }
          } catch (error) {
            logError('Failed to check cloud updates for identity:', identity.publicKey, error);
          }
        }
      }
      
      // Save updated identities back to localStorage
      localStorage.setItem('pwa_stored_identities', JSON.stringify(stored));
              logDebug('Cloud sync check completed');
      
    } catch (error) {
              logError('Failed to check for cloud updates:', error);
    }
  };

  // Helper function to get time ago string
  const getTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return `${Math.floor(diffInDays / 7)}w ago`;
  };

  // Get offline sync status
  const getOfflineSyncStatus = () => {
    const pendingSync = SecureMetadataStorage.getPendingSync();
    const pendingCount = Object.keys(pendingSync).filter(key => !pendingSync[key].synced).length;
    return {
      hasPending: pendingCount > 0,
      pendingCount,
      lastSync: pendingCount > 0 ? 
        getTimeAgo(new Date(Object.values(pendingSync)[0]?.timestamp || Date.now())) : 
        'All synced'
    };
  };

  const generateSyncKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const createDeviceQRData = async (deviceData: {
    name: string;
    type: 'mobile' | 'desktop' | 'tablet' | 'other';
  }) => {
    const syncData = {
      deviceId: `device-${Date.now()}`,
      deviceName: deviceData.name,
      deviceType: deviceData.type,
      syncKey: generateSyncKey(),
      identityId: authenticatedUser?.id || 'unknown',
      deviceFingerprint: generateDeviceFingerprint(),
    };
    
    // Generate real QR code
    const qrCodeDataURL = await QRCodeManager.generateDevicePairingQR(syncData);
    
    return {
      ...syncData,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      qrCodeDataURL
    };
  };

  const initializeCurrentDevice = () => {
    if (authenticatedUser && syncedDevices.length === 0) {
      const currentDevice: SyncedDevice = {
        id: `primary-${Date.now()}`,
        name: `${navigator.platform} - ${navigator.userAgent.split(' ').pop()?.split('/')[0] || 'Unknown'}`,
        type: 'desktop', // Default to desktop, could be enhanced with better detection
        lastSync: new Date().toISOString(),
        status: 'active',
        location: 'Current Location',
        ipAddress: 'Current IP',
        isPrimary: true, // This is the primary device
        deviceFingerprint: generateDeviceFingerprint(),
        syncKey: generateSyncKey(),
        pairedAt: new Date().toISOString()
      };
      
      setCurrentDevice(currentDevice);
      setSyncedDevices([currentDevice]);
    }
  };

  // Function to sync data from webapp storage to PWA
  const syncFromWebappStorage = async (): Promise<{ identities: any[] } | null> => {
    try {
      // Try to access the webapp's IndexedDB storage
      const webappDB = indexedDB.open('IdentityProtocolDB', 1);
      
      return new Promise((resolve) => { // @ts-ignore
        webappDB.onsuccess = async () => {
          try {
            const db = webappDB.result;
            const transaction = db.transaction(['identities'], 'readonly');
            const store = transaction.objectStore('identities');
            const request = store.getAll();
            
            request.onsuccess = () => {
              const identities = request.result;
              logDebug('Found', identities.length, 'identities in webapp storage');
              resolve({ identities });
            };
            
            request.onerror = () => {
              logDebug('Could not read from webapp storage');
              resolve(null);
            };
          } catch (error) {
            logError('Error accessing webapp storage:', error);
            resolve(null);
          }
        };
        
        webappDB.onerror = () => {
          logDebug('Could not open webapp database');
          resolve(null);
        };
      });
    } catch (error) {
      logError('Error in syncFromWebappStorage:', error);
      return null;
    }
  };

  // Initialize storage and load existing data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await storage.init();
        logDebug('Storage initialized');
        
        // Load existing identities for debugging
        const identities = await storage.getIdentities();
        logDebug('Available identities:', identities);
        
        // Since all data is encrypted, we can't display identities without decrypting
        // The user will need to enter pnName and passcode to unlock
        logDebug('Found', identities.length, 'encrypted identities - user must unlock with credentials');
        // Don't set dids here - let the other useEffect handle PWA identity loading
        
        // Check if we're in PWA mode
        const isPWA = window.matchMedia('(display-mode: standalone)').matches;
        logDebug('Is PWA:', isPWA);
        
        // If in PWA and no identities found, try to sync from webapp storage
        if (isPWA && identities.length === 0) {
                      logDebug('PWA detected with no identities, attempting to sync from webapp storage');
          try {
            // Try to access the webapp's storage context
            const webappStorage = await syncFromWebappStorage();
            if (webappStorage && webappStorage.identities.length > 0) {
              logDebug('Found identities in webapp storage, syncing to PWA');
              for (const identity of webappStorage.identities) {
                await storage.storeIdentity(identity);
              }
                              logDebug('Synced', webappStorage.identities.length, 'identities to PWA');
            }
          } catch (error) {
                          logError('Could not sync from webapp storage:', error);
          }
        }
        
        // Don't automatically restore sessions - user must unlock their ID each time
                  logDebug('Not restoring session - user must unlock ID manually');
        setAuthenticatedUser(null);
        
        // Recovery keys are now stored encrypted in the ID file
        // They will be loaded when identities are decrypted
        
        // Set up realtime listeners for cross-device sync
        try {
                // const realtimeManager = RealtimeManager.getInstance();
      // await realtimeManager.connect();
          
          // Subscribe to device sync updates for nickname changes (disabled in dev mode)
          // realtimeManager.subscribe('device-sync', (message) => {
          //   if (message.data.action === 'nickname-updated') {
          //     const { identityId, newNickname } = message.data.data;
          //     handleIncomingNicknameUpdate(identityId, newNickname);
          //   }
          // });
          
          logDebug('Realtime listeners set up for cross-device sync');
        } catch (error) {
          logError('Failed to set up realtime listeners:', error);
        }

        // Initialize cloud sync for cross-platform nickname updates
        try {
          await cloudSyncManager.initialize();
          logDebug('Cloud sync initialized for cross-platform updates');
          
          // Check for cloud updates if in PWA mode
          if (isPWA) {
            await checkForCloudUpdates();
          }
        } catch (error) {
          logError('Failed to initialize cloud sync:', error);
          // Don't fail the entire initialization if cloud sync fails
        }


      } catch (error) {
                  logError('Failed to initialize storage:', error);
        setError('Failed to initialize storage');
      } finally {
        // Cleanup completed
      }
    };

    initializeApp();
  }, [storage]);

  // Initialize current device when user authenticates
  useEffect(() => {
    if (authenticatedUser) {
      initializeCurrentDevice();
    }
  }, [authenticatedUser]);

  // PWA lock management with stable dependencies
  useEffect(() => {
    let lockTimeout: NodeJS.Timeout | null = null;

    const checkInitialLock = () => {
      if (pwaState.isInstalled && !authenticatedUser) {
        const lastUnlockTime = localStorage.getItem('pwa-last-unlock-time');
        if (lastUnlockTime) {
          const unlockTime = parseInt(lastUnlockTime);
          const now = Date.now();
          const timeSinceUnlock = now - unlockTime;
          
          // Lock after 5 minutes of inactivity
          if (timeSinceUnlock > 5 * 60 * 1000) {
            setIsPWALocked(true);
          }
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pwaState.isInstalled && authenticatedUser) {
        // Lock when tab becomes hidden
        if (lockTimeout) {
          clearTimeout(lockTimeout);
        }
        lockTimeout = setTimeout(() => {
          setIsPWALocked(true);
        }, 5 * 60 * 1000); // Lock after 5 minutes of inactivity
      }
    };

    const handleUserActivity = () => {
      // Reset lock timer on user activity
      if (lockTimeout) {
        clearTimeout(lockTimeout);
      }
      
      if (document.hidden) {
        lockTimeout = setTimeout(() => {
          setIsPWALocked(true);
        }, 5 * 60 * 1000); // Lock after 5 minutes of inactivity
      }
    };

    // Set up event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('mousedown', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);

    // Check initial lock state when PWA is launched
    checkInitialLock();

    // Initial lock timer if app is hidden
    if (document.hidden) {
      lockTimeout = setTimeout(() => {
        setIsPWALocked(true);
      }, 5 * 60 * 1000);
    }

    return () => {
      // Cleanup
      if (lockTimeout) {
        clearTimeout(lockTimeout);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('mousedown', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
    };
  }, [pwaState.isInstalled]); // Removed authenticatedUser dependency to prevent unnecessary re-registration

  // Handle PWA unlock
  const handlePWAUnlock = () => {
    // Only show success message if this is actually an unlock action
    // (i.e., if the PWA was previously locked)
    const wasLocked = isPWALocked;
    
    setIsPWALocked(false);
    // Store the unlock time
    localStorage.setItem('pwa-last-unlock-time', Date.now().toString());
    
    // Only show success message if this was actually an unlock action
    if (wasLocked) {
      // Show appropriate message based on context with proper timeout management
      if (authenticatedUser) {
        // This is an ID unlock, not a PWA unlock
        showSuccessMessage('Identity unlocked successfully');
      } else {
        // This is a PWA unlock
        showSuccessMessage('PWA unlocked successfully');
      }
    }
  };

  // Handle PWA fallback to passcode (mobile only)
  const handlePWAFallback = () => {
    setIsPWALocked(false);
    setShowUnifiedAuth(true);
  };

  // Handle PWA unlock for desktop (no popup)
  /*
  const handlePWADesktopUnlock = () => {
    setIsPWALocked(false);
    // Store the unlock time
    localStorage.setItem('pwa-last-unlock-time', Date.now().toString());
    // Don't show any popup or success message - just unlock silently
  };
  */

  // Device pairing handler (currently unused but available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDevicePairing = async (qrData: string) => {
    try {
      // Parse and validate QR code data using the QR code manager
      const parsedData = await QRCodeManager.parseQRCode(qrData);
      
      if (parsedData.type !== 'device-pairing') {
        throw new Error('Invalid QR code type');
      }
      
      const syncData = parsedData.data;
      
      // Create the new synced device
      const newDevice: SyncedDevice = {
        id: syncData.deviceId,
        name: syncData.deviceName,
        type: syncData.deviceType,
        lastSync: new Date().toISOString(),
        status: 'active',
        location: 'Unknown', // Will be updated with real location
        ipAddress: 'Unknown', // Will be updated with real IP
        isPrimary: false, // New devices are never primary
        deviceFingerprint: generateDeviceFingerprint(),
        syncKey: syncData.syncKey,
        pairedAt: new Date().toISOString()
      };
      
      setSyncedDevices(prev => [...prev, newDevice]);
      setSuccess('Device paired successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to pair device');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Handle recovery completion and primary device designation
  const handleRecoveryComplete = (recoveredDID: DIDInfo) => {
    try {
      // Set the authenticated user to the recovered DID
      setAuthenticatedUser({
        id: recoveredDID.id,
        pnName: recoveredDID.pnName,
        nickname: recoveredDID.nickname,
        accessToken: `recovered-token-${Date.now()}`,
        expiresIn: 3600,
        authenticatedAt: new Date().toISOString()
      });

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
      setSyncedDevices([recoveredPrimaryDevice]);
      
      // Update recovery request status
      setRecoveryRequests(prev => prev.map(req => 
        req.requestingDid === recoveredDID.id 
          ? { ...req, status: 'approved' as const }
          : req
      ));
      
      setSuccess('Identity recovered successfully! This device is now your primary device.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to complete recovery');
    }
  };

  // Handle opening custodian approval modal
  const handleOpenCustodianApprovalModal = (custodianship: {
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  }) => {
    const pendingRequest = recoveryRequests.find(r => r.requestingDid === custodianship.identityId && r.status === 'pending');
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
        setTimeout(() => setError(null), 5000);
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
      setSuccess(`Custodianship accepted! You are now a custodian for ${invitationData.identityName}`);
      setTimeout(() => setSuccess(null), 5000);

      // Close the invitation modal
      setShowCustodianInvitationModal(false);
      setPendingCustodianInvitation(null);

    } catch (error: any) {
      setError(error.message || 'Failed to accept custodianship');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Handle custodian invitation QR code acceptance
  // @ts-ignore
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
      
      setSuccess('Custodianship accepted successfully! You can now approve recovery requests for this identity.');
      setTimeout(() => setSuccess(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to accept custodian invitation');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Auto-clear notifications after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);



  // Helper function to format version detection messages
  const formatUpdateMessage = (updateType: string, data: any): string => {
    switch (updateType) {
      case 'nickname':
        return `Nickname updated to: ${data.newNickname}`;
      case 'profile-picture':
        return 'Profile picture updated';
      case 'custodian':
        return data.action === 'add' 
          ? `Custodian added: ${data.custodian.name}`
          : 'Custodian removed';
      case 'recovery-key':
        return 'Recovery key generated';
      case 'device':
        return 'Device removed';
      case 'privacy':
        return 'Privacy settings updated';
      default:
        return `${updateType} updated`;
    }
  };

  // @ts-ignore
  // Simple unlock handler (currently unused but available for future use)
  const handleSimpleUnlock = async (file: File, passcode: string) => {
    try {
      logDebug('Starting unlock process...');
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
              logDebug('Initializing storage...');
      await storage.init();

      // Read the file content
              logDebug('Reading file content...');
      const fileContent = await file.text();
              logDebug('File content:', fileContent.substring(0, 200) + '...');
      
      // Try to parse as JSON first
      let identityData;
      try {
        identityData = JSON.parse(fileContent);
        logDebug('Parsed identity data:', identityData);
      } catch (parseError) {
        logError('JSON parse error:', parseError);
        // If not JSON, try to parse as plain text or other format
        throw new Error('Unsupported file format. Please use a JSON PN file.');
      }

      // Handle different possible formats
      let identityToUnlock;
      
      if (identityData.identities && Array.isArray(identityData.identities)) {
        // Backup format with multiple identities
        if (identityData.identities.length === 1) {
          identityToUnlock = identityData.identities[0];
        } else {
          throw new Error('Multiple identities found. Please specify which one to unlock.');
        }
      } else if (identityData.id || identityData.pnName) {
        // Single identity format
        identityToUnlock = identityData;
      } else {
        throw new Error('Invalid PN file format');
      }

      // 🔄 VERSION DETECTION: Check for cloud updates and apply them
      let updatedIdentityData = { ...identityToUnlock };
      let hasCloudUpdates = false;
      let updateMessages: string[] = [];
      
      try {
        await cloudSyncManager.initialize();
        const cloudUpdates = await cloudSyncManager.getUpdates(identityToUnlock.publicKey || identityToUnlock.id);
        
        if (cloudUpdates.length > 0) {
          // Get the file's last modified timestamp
          const fileLastModified = file.lastModified;
          const fileDate = new Date(fileLastModified);
          
          logDebug('File timestamp:', fileDate.toISOString());
          logDebug('Checking', cloudUpdates.length, 'cloud updates...');
          
          // Check if any cloud updates are newer than the file
          for (const update of cloudUpdates) {
            const updateDate = new Date(update.updatedAt);
            
            if (updateDate > fileDate) {
              logDebug('Found newer cloud data for identity:', identityToUnlock.id);
                              logDebug('Update type:', update.type, 'at:', update.updatedAt);
              hasCloudUpdates = true;
              
              // Apply cloud updates to the identity data
              switch (update.type) {
                case 'nickname':
                  if (update.data.newNickname) {
                    updatedIdentityData.nickname = update.data.newNickname;
                    updatedIdentityData.displayName = update.data.newNickname;
                    updateMessages.push(formatUpdateMessage('nickname', update.data));
                  }
                  break;
                  
                case 'profile-picture':
                  if (update.data.newProfilePicture) {
                    updatedIdentityData.profilePicture = update.data.newProfilePicture;
                    updateMessages.push(formatUpdateMessage('profile-picture', update.data));
                  }
                  break;
                  
                case 'custodian':
                  if (update.data.action === 'add' && update.data.custodian) {
                    if (!updatedIdentityData.custodians) updatedIdentityData.custodians = [];
                    updatedIdentityData.custodians.push(update.data.custodian);
                    updateMessages.push(formatUpdateMessage('custodian', update.data));
                  } else if (update.data.action === 'remove' && update.data.custodianId) {
                    if (updatedIdentityData.custodians) {
                      updatedIdentityData.custodians = updatedIdentityData.custodians.filter(
                        (c: any) => c.id !== update.data.custodianId
                      );
                      updateMessages.push(formatUpdateMessage('custodian', update.data));
                    }
                  }
                  break;
                  
                case 'recovery-key':
                  if (update.data.action === 'generate' && update.data.recoveryKey) {
                    if (!updatedIdentityData.recoveryKeys) updatedIdentityData.recoveryKeys = [];
                    updatedIdentityData.recoveryKeys.push(update.data.recoveryKey);
                    updateMessages.push(formatUpdateMessage('recovery-key', update.data));
                  }
                  break;
                  
                case 'device':
                  if (update.data.action === 'remove' && update.data.deviceId) {
                    if (updatedIdentityData.syncedDevices) {
                      updatedIdentityData.syncedDevices = updatedIdentityData.syncedDevices.filter(
                        (d: any) => d.id !== update.data.deviceId
                      );
                      updateMessages.push(formatUpdateMessage('device', update.data));
                    }
                  }
                  break;
                  
                case 'privacy':
                  if (update.data.action === 'update' && update.data.newSettings) {
                    updatedIdentityData.privacySettings = update.data.newSettings;
                    updateMessages.push(formatUpdateMessage('privacy', update.data));
                  }
                  break;
              }
            }
          }
        }
      } catch (error) {
        logError('Failed to check cloud updates during unlock:', error);
        // Continue with unlock even if cloud check fails
      }

      // Use the updated identity data for authentication
      const finalIdentityToUnlock = hasCloudUpdates ? updatedIdentityData : identityToUnlock;

      // 🔐 SECURE METADATA: Apply encrypted metadata to identity
      let identityWithMetadata = finalIdentityToUnlock;
      try {
        identityWithMetadata = await SecureMetadataStorage.applyMetadataToIdentity(
          finalIdentityToUnlock,
          finalIdentityToUnlock.pnName,
          passcode
        );
        logDebug('Applied secure metadata to identity');
      } catch (error) {
        logError('Failed to apply secure metadata:', error);
        // Continue with original identity if metadata fails
        identityWithMetadata = finalIdentityToUnlock;
      }

      // Check if this is an encrypted identity (has encryptedData, iv, salt)
      if (identityWithMetadata.encryptedData && identityWithMetadata.iv && identityWithMetadata.salt) {
        // This is an encrypted identity, try to authenticate it
        try {
          const authSession = await IdentityCrypto.authenticateIdentity(
              identityWithMetadata as any,
            passcode,
              identityWithMetadata.pnName || 'unknown'
          );

          // Store the session
          await storage.storeSession(authSession);

          // Create DID info for UI
          const didInfo: DIDInfo = {
            id: identityWithMetadata.id,
            pnName: identityWithMetadata.pnName,
            nickname: identityWithMetadata.nickname || identityWithMetadata.pnName,
            email: identityWithMetadata.email || '',
            phone: identityWithMetadata.phone || '',
            recoveryEmail: identityWithMetadata.recoveryEmail || '',
            recoveryPhone: identityWithMetadata.recoveryPhone || '',
            createdAt: identityWithMetadata.createdAt || new Date().toISOString(),
            status: identityWithMetadata.status || 'active',
            custodiansRequired: identityWithMetadata.custodiansRequired || false,
            custodiansSetup: identityWithMetadata.custodiansSetup || false
          };

          setDids(prev => [...prev, didInfo]);
          setSelectedDID(didInfo);
          
          // Set authenticated user
          setAuthenticatedUser(authSession);
          
          const successMessage = hasCloudUpdates 
            ? `PN file unlocked and updated with latest data! ${updateMessages.join(', ')}`
            : 'PN file unlocked successfully!';
          showSuccessMessage(successMessage, 5000);
        } catch (authError: any) {
          throw new Error(`Authentication failed: ${authError.message}`);
        }
      } else {
        // This appears to be a plain identity, create a mock session for demo purposes
        const mockSession = {
          id: finalIdentityToUnlock.id || 'demo-id',
          pnName: finalIdentityToUnlock.pnName || 'demo-user',
          nickname: finalIdentityToUnlock.nickname || finalIdentityToUnlock.pnName || 'Demo User',
          accessToken: 'demo-token-' + Date.now(),
          expiresIn: 3600,
          authenticatedAt: new Date().toISOString(),
          publicKey: finalIdentityToUnlock.publicKey || ''
        };

        // Store the session
        await storage.storeSession(mockSession);

        // Create DID info for UI
        const didInfo: DIDInfo = {
          id: finalIdentityToUnlock.id || 'demo-id',
          pnName: finalIdentityToUnlock.pnName || 'demo-user',
          nickname: finalIdentityToUnlock.nickname || finalIdentityToUnlock.pnName || 'Demo User',
          email: finalIdentityToUnlock.email || '',
          phone: finalIdentityToUnlock.phone || '',
          recoveryEmail: finalIdentityToUnlock.recoveryEmail || '',
          recoveryPhone: finalIdentityToUnlock.recoveryPhone || '',
          createdAt: finalIdentityToUnlock.createdAt || new Date().toISOString(),
          status: finalIdentityToUnlock.status || 'active',
          custodiansRequired: finalIdentityToUnlock.custodiansRequired || false,
          custodiansSetup: finalIdentityToUnlock.custodiansSetup || false
        };

        setDids(prev => [...prev, didInfo]);
        setSelectedDID(didInfo);
        
        // Set authenticated user
        setAuthenticatedUser(mockSession);
        
        const successMessage = hasCloudUpdates 
          ? `PN file unlocked and updated with latest data! ${updateMessages.join(', ')} (Demo mode)`
          : 'PN file unlocked successfully! (Demo mode)';
        showSuccessMessage(successMessage, 5000);
      }
    } catch (error: any) {
        logError('Unlock error:', error);
      setError(error.message || 'Failed to unlock PN file');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  /*
  // Input validation and sanitization using comprehensive framework
  const sanitizeInput = (input: string): string => {
    const validation = InputValidator.validateDisplayName(input);
    return validation.sanitizedValue || input.trim();
  };

  const validateDisplayName = (name: string): boolean => {
    const validation = InputValidator.validateDisplayName(name);
    return validation.isValid;
  };
  */

  /*
  const handleCreateIdentity = async () => {
    try {
      if (!newIdentityName.trim()) {
        setError('Identity name is required');
        return;
      }

      const sanitizedName = sanitizeInput(newIdentityName.trim());
      
      if (!validateDisplayName(sanitizedName)) {
        setError('Invalid identity name format');
        return;
      }

      if (sanitizedName.length > 50) {
        setError('Identity name must be 50 characters or less');
        return;
      }

      // Check for duplicate names
      const existingNames = identities.map(id => id.displayName?.toLowerCase() || '');
      if (existingNames.includes(sanitizedName.toLowerCase())) {
        setError('An identity with this name already exists');
        return;
      }

      setLoading(true);
      setError('');

      const newIdentity = await identityManager.createIdentity(sanitizedName);
      
      if (newIdentity) {
        setIdentities(prev => [...prev, {
          id: newIdentity.id || `id-${Date.now()}`,
          pnName: newIdentity.pnName || 'unknown',
          nickname: newIdentity.nickname || 'Unknown User',
          email: '',
          phone: '',
          recoveryEmail: '',
          recoveryPhone: '',
          createdAt: newIdentity.createdAt || new Date().toISOString(),
          status: 'active',
          custodiansRequired: false,
          custodiansSetup: false,
          profilePicture: newIdentity.profilePicture
        }]);
        setNewIdentityName('');
        setShowCreateForm(false);
        setSuccess(`Identity "${sanitizedName}" created successfully!`);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (error) {
      setError('Failed to create identity. Please try again.');
      logError('Create identity error:', error);
    } finally {
      // setIsLoading(false);
    }
  };

  /*
  const handleUpdateIdentity = async (id: string, newName: string) => {
    try {
      if (!newName.trim()) {
        setError('Identity name is required');
        return;
      }

      const sanitizedName = sanitizeInput(newName.trim());
      
      if (!validateDisplayName(sanitizedName)) {
        setError('Invalid identity name format');
        return;
      }

      if (sanitizedName.length > 50) {
        setError('Identity name must be 50 characters or less');
        return;
      }

      // Check for duplicate names (excluding current identity)
      const existingNames = identities
        .filter(identity => identity.id !== id)
        .map(identity => identity.displayName?.toLowerCase() || '');
      
      if (existingNames.includes(sanitizedName.toLowerCase())) {
        setError('An identity with this name already exists');
        return;
      }

      // setIsLoading(true);
      setError('');

      const updatedIdentity = await identityManager.updateIdentity(id, sanitizedName);
      
      if (updatedIdentity) {
        setIdentities(prev => 
          prev.map(identity => 
            identity.id === id ? { ...identity, displayName: sanitizedName } : identity
          )
        );
        // setEditingId(null);
        // setSuccessMessage(`Identity renamed to "${sanitizedName}" successfully!`);
        
        // Clear success message after 3 seconds
        // setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (error) {
      setError('Failed to update identity. Please try again.');
      logError('Edit identity error:', error);
    } finally {
      // setIsLoading(false);
    }
  };
  */

  // Replace all console.log and console.error calls with production-safe versions
  useEffect(() => {
    logDebug('PWA State:', pwaState);
  }, [pwaState]);

  return (
    <div className="min-h-screen theme-dark bg-bg-primary text-text-primary">
      <Header
        authenticatedUser={authenticatedUser}
        onLogout={handleLogout}
        onOfflineModeChange={handleOfflineModeChange}
        pwaState={pwaState}
        onPWAInstall={pwaHandlers?.install}
        onPWACheckUpdate={pwaHandlers?.checkForUpdates}
        onExport={handleExportData}

      />




      
      {/* Success Display */}
      {success && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 mb-4 p-3 bg-green-100 border border-green-200 rounded-lg shadow-lg">
          <p className="text-green-700 text-sm">{success}</p>
          <button 
            onClick={() => {
              console.log('Manual clear clicked');
              setSuccess(null);
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
              }
            }}
            className="absolute top-1 right-1 text-green-600 hover:text-green-800"
          >
            ×
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && authenticatedUser && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 mb-4 p-3 bg-red-100 border border-red-200 rounded-lg shadow-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Offline Sync Status */}
      {authenticatedUser && pwaState.isInstalled && (
        (() => {
          const syncStatus = getOfflineSyncStatus();
          if (syncStatus.hasPending) {
            return (
              <div className="fixed top-16 right-4 z-50 mb-4 p-3 bg-yellow-100 border border-yellow-200 rounded-lg shadow-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-yellow-700 text-sm">
                    <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  {syncStatus.pendingCount} offline change{syncStatus.pendingCount > 1 ? 's' : ''} pending sync
                </div>
                  </span>
                  <button
                    onClick={async () => {
                      const result = await SecureMetadataStorage.syncPendingToCloud();
                      if (result.synced > 0) {
                        setSuccess(`Synced ${result.synced} changes to cloud`);
                        setTimeout(() => setSuccess(null), 3000);
                      }
                    }}
                    className="px-2 py-1 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700"
                  >
                    Sync Now
                  </button>
                </div>
              </div>
            );
          }
          return null;
        })()
      )}
      
      <main className="pt-12">
                {/* Main Screen - Show when not authenticated */}
        {!authenticatedUser && (
          <div className="max-w-6xl mx-auto text-text-primary pt-6">
            
            {/* Header */}
            <div className="flex justify-center items-center mb-8">
              <div className="w-[270px] h-[270px]">
                <Logo />
              </div>
            </div>
            

            
            {/* Simple Form */}
            <div className="max-w-md mx-auto relative z-20">
              <div className="bg-modal-bg rounded-lg shadow p-6">
                <form className="space-y-4" onSubmit={handleMainFormSubmit}>


                  
                  {/* Web app message */}
                  {!pwaState.isInstalled && (
                    <div className="text-center mb-6">
                      <p className="text-sm text-gray-500 mb-4">
                        Upload your PN file to unlock your PN
                      </p>
                    </div>
                  )}

                  {/* Identity Selector - Only show in PWA mode when there are stored identities */}
                  {pwaState.isInstalled && (
                    <div>
                      <IdentitySelector
                        selectedIdentity={selectedStoredIdentity}
                        onIdentitySelect={handleIdentitySelect}
                        onUploadNew={() => {
                          // Trigger file upload dialog
                          document.getElementById('file-upload')?.click();
                        }}
                        onCreateNew={() => setShowCreateForm(true)}

                        onDeleteIdentity={handleDeleteIdentity}
                      />
                      
                      {/* Show file upload option for PWA when no stored identities */}
                      {!selectedStoredIdentity && !mainForm.uploadFile && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-text-primary mb-1">
                            Or Upload New PN File
                          </label>
                          
                          <div className="relative">
                            <input
                              type="file"
                              accept=".json,.txt"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  setMainForm(prev => ({ ...prev, uploadFile: file }));
                                  // Clear selected identity when uploading new file
                                  setSelectedStoredIdentity(null);
                                }
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              id="file-upload-pwa"
                            />
                            <label
                              htmlFor="file-upload-pwa"
                              className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-input-border bg-input-bg rounded-lg cursor-pointer hover:border-primary transition-colors"
                            >
                              <div className="text-center">
                                <div className="text-2xl mb-2">↑</div>
                                <div className="text-sm text-text-primary font-medium">
                                  Upload new PN file
                                </div>
                                <div className="text-xs text-text-secondary mt-1">
                                  (.json or .txt)
                                </div>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* File upload for web app or when no stored identities */}
                  {!pwaState.isInstalled && (
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Upload PN File (Required)
                      </label>
                      
                      <div className="relative">
                        <input
                          type="file"
                          accept=".json,.txt"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setMainForm(prev => ({ ...prev, uploadFile: file }));
                              // Clear selected identity when uploading new file
                              setSelectedStoredIdentity(null);
                            }
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          id="file-upload-web"
                        />
                        <label
                          htmlFor="file-upload-web"
                          className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-input-border bg-input-bg rounded-lg cursor-pointer hover:border-primary transition-colors"
                        >
                          <div className="text-center">
                            <div className="text-2xl mb-2">↑</div>
                            <div className="text-sm text-text-primary font-medium">
                              {mainForm.uploadFile ? mainForm.uploadFile.name : 'Tap to upload PN file'}
                            </div>
                            <div className="text-xs text-text-secondary mt-1">
                              (.json or .txt)
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                  
                  {/* pN Name input - auto-filled if identity selected */}
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      pN Name
                    </label>
                    <input
                      type="text"
                      value={mainForm.pnName || ''}
                      onChange={(e) => setMainForm(prev => ({ ...prev, pnName: e.target.value }))}
                      className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter your pN Name"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      Passcode
                    </label>
                    <input
                      type="password"
                      value={mainForm.passcode || ''}
                      onChange={(e) => setMainForm(prev => ({ ...prev, passcode: e.target.value }))}
                      className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter your passcode"
                      required
                    />
                  </div>
                  
                  {/* Hidden file upload for when user chooses to upload new file */}
                  <input
                    type="file"
                    accept=".json,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setMainForm(prev => ({ ...prev, uploadFile: file }));
                        // Clear selected identity when uploading new file
                        setSelectedStoredIdentity(null);
                      }
                    }}
                    className="hidden"
                    id="file-upload"
                  />
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:btn-text rounded-md hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? 'Unlocking...' : 'Unlock PN'}
                  </button>
                </form>
                
                <div className="mt-6 text-center">
                  <p className="text-sm text-text-secondary mb-3">Don&apos;t have a PN yet?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(true)}
                      className="flex-1 px-3 py-2 border border-border text-text-primary rounded-md hover:bg-hover transition-colors text-sm"
                    >
                      Create New PN
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRecoveryModal(true)}
                      className="flex-1 px-3 py-2 border border-border text-text-primary rounded-md hover:bg-hover transition-colors text-sm"
                    >
                      Recover PN
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Unified Authentication Modal - Only show when explicitly triggered */}
        {showUnifiedAuth && !authenticatedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Secure Authentication</h2>
            <button 
                  onClick={() => setShowUnifiedAuth(false)}
                  className="modal-close-button"
            >
                  ✕
            </button>
                            </div>
              <UnifiedAuth
                onAuthSuccess={handleAuthSuccess}
                onAuthError={handleAuthError}
                onCreateId={() => setShowCreateForm(true)}
                onImportId={() => setShowImportForm(true)}
              />
                            </div>
          </div>
        )}

        {/* Create DID Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Create New PN</h2>
                  <button 
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateStep(1);
                    setCreateForm({
                      pnName: '',
                      confirmPNName: '',
                      passcode: '',
                      confirmPasscode: '',
                      email: '',
                      phone: '',
                      recoveryEmail: '',
                      confirmRecoveryEmail: '',
                      recoveryPhone: '',
                      confirmRecoveryPhone: '',
                      recoveryContactType: 'email'
                    });
                  }}
                  className="modal-close-button"
                >
                  ✕
                  </button>
                </div>
                
                {/* Step Indicator */}
                <div className="flex items-center justify-center mb-6">
                  <div className="flex items-center space-x-2">
                    {/* Step 1 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 1 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : createStep >= 2
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      1
                    </div>
                    
                    {/* Connecting Line */}
                    <div className={`w-12 h-1 ${
                      createStep >= 2 ? 'bg-blue-600' : 'bg-gray-400'
                    }`}></div>
                    
                    {/* Step 2 Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 ${
                      createStep === 2 
                        ? 'bg-blue-600 text-white border-blue-600' 
                        : 'bg-transparent text-gray-400 border-gray-400'
                    }`}>
                      2
                    </div>
                  </div>
                </div>
                
              {createStep === 1 ? (
                <form key="step1" onSubmit={(e) => { e.preventDefault(); setCreateStep(2); }} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 1: Enter Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        pN Name
                      </label>
                      <input
                        type="text"
                        value={createForm.pnName}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, pnName: e.target.value }))}
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter pN Name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Passcode
                      </label>
                      <input
                        type="password"
                        value={createForm.passcode}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, passcode: e.target.value }))}
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter passcode"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact Type
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="email"
                            checked={createForm.recoveryContactType === 'email'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Email</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="recoveryContactType"
                            value="phone"
                            checked={createForm.recoveryContactType === 'phone'}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryContactType: e.target.value as 'email' | 'phone' }))}
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Phone</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.recoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.recoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Enter recovery phone"
                          required
                        />
                      )}
                      <p className="text-xs text-text-secondary mt-1">
                        This will only be used for recovery if you lose access
                      </p>
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={!createForm.pnName || !createForm.passcode || 
                        (createForm.recoveryContactType === 'email' ? !createForm.recoveryEmail : !createForm.recoveryPhone)}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <form key="step2" onSubmit={handleCreateDID} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-text-primary border-b border-border pb-2">Step 2: Confirm Your Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm pN Name
                      </label>
                      <input
                        type="text"
                        value={createForm.confirmPNName}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPNName: e.target.value }))}
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Confirm your pN Name"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Passcode
                      </label>
                      <input
                        type="password"
                        value={createForm.confirmPasscode}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPasscode: e.target.value }))}
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Confirm your passcode"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Confirm Recovery Contact
                      </label>
                      {createForm.recoveryContactType === 'email' ? (
                        <input
                          type="email"
                          value={createForm.confirmRecoveryEmail}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryEmail: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery email"
                          required
                        />
                      ) : (
                        <input
                          type="tel"
                          value={createForm.confirmRecoveryPhone}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, confirmRecoveryPhone: e.target.value }))}
                          className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder="Confirm your recovery phone"
                          required
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex space-x-2">
                    <button
                      type="button"
                      onClick={() => setCreateStep(1)}
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 modal-button rounded-md"
                      disabled={!createForm.confirmPNName || !createForm.confirmPasscode || 
                        (createForm.recoveryContactType === 'email' ? !createForm.confirmRecoveryEmail : !createForm.confirmRecoveryPhone)}
                    >
                      Create PN
                    </button>
                  </div>
                </form>
              )}
                  </div>
                </div>
        )}

        {/* Import DID Modal */}
        {showImportForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Unlock PN</h2>
                  <button 
                  onClick={() => setShowImportForm(false)}
                  className="modal-close-button"
                >
                  ✕
                  </button>
                </div>
              <form onSubmit={handleImportDID} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Identity File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setImportForm(prev => ({ ...prev, backupFile: e.target.files?.[0] || null }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-black rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Upload your identity file (.json) to unlock your identity
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    pN Name
                  </label>
                  <input
                    type="text"
                    value={importForm.pnName}
                    onChange={(e) => setImportForm(prev => ({ ...prev, pnName: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-black rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your pN Name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={importForm.passcode}
                    onChange={(e) => setImportForm(prev => ({ ...prev, passcode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-black rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter passcode"
                    required
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    {loading ? 'Unlocking...' : 'Unlock PN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportForm(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </form>
                      </div>
                    </div>
                  )}

        {/* Recovery Modal */}
        {showRecoveryModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Recover PN</h2>
                  <button 
                  onClick={() => setShowRecoveryModal(false)}
                  className="modal-close-button"
                >
                  ✕
                  </button>
                </div>

              {/* Recovery Method Selection */}
              <div className="space-y-4 mb-6">
                <button
                  type="button"
                  onClick={() => setActiveRecoveryMethod('key')}
                  className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                    activeRecoveryMethod === 'key'
                      ? 'border-primary bg-primary text-bg-primary shadow-lg'
                      : 'border-border bg-secondary text-text-primary hover:bg-hover'
                  }`}
                >
                  <div className={`font-medium ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-primary'}`}>Use Recovery Key</div>
                  <div className={`text-sm ${activeRecoveryMethod === 'key' ? 'text-bg-primary' : 'text-text-secondary'}`}>I have a recovery key</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setActiveRecoveryMethod('factor')}
                  className={`w-full p-4 rounded-lg border-2 transition-all duration-200 ${
                    activeRecoveryMethod === 'factor'
                      ? 'border-primary bg-primary text-bg-primary shadow-lg'
                      : 'border-border bg-secondary text-text-primary hover:bg-hover'
                  }`}
                >
                  <div className={`font-medium ${activeRecoveryMethod === 'factor' ? 'text-bg-primary' : 'text-text-primary'}`}>4-Factor Verification</div>
                  <div className={`text-sm ${activeRecoveryMethod === 'factor' ? 'text-bg-primary' : 'text-text-secondary'}`}>Use pnName, passcode, nickname, and contact</div>
                </button>
              </div>

              {/* Recovery Key Form */}
              {activeRecoveryMethod === 'key' && (
                <div className="mt-4 p-4 bg-secondary rounded-lg">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleInitiateRecoveryWithKey(
                      formData.get('recoveryKey') as string,
                      {
                        contactType: formData.get('contactType') as 'email' | 'phone',
                        contactValue: formData.get('contactValue') as string,
                        claimantName: formData.get('claimantName') as string,
                      }
                    );
                  }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Key
                      </label>
                      <textarea
                        name="recoveryKey"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Paste your recovery key here"
                        rows={3}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Your Name
                      </label>
                      <input
                        name="claimantName"
                        type="text"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your full name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Contact Type
                      </label>
                      <div className="flex space-x-4">
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="contactType"
                            value="email"
                            defaultChecked
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Email</span>
                        </label>
                        <label className="flex items-center">
                          <input
                            type="radio"
                            name="contactType"
                            value="phone"
                            className="mr-2"
                          />
                          <span className="text-sm text-text-primary">Phone</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Contact Value
                      </label>
                      <input
                        name="contactValue"
                        type="text"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your email or phone number"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 modal-button rounded-md font-medium"
                    >
                      Submit Recovery Request
                    </button>
                  </form>
                </div>
              )}

              {/* 4-Factor Form */}
              {activeRecoveryMethod === 'factor' && (
                <div className="mt-4 p-4 bg-secondary rounded-lg">
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    handleInitiateRecovery({
                      pnName: formData.get('pnName') as string,
                      passcode: formData.get('passcode') as string,
                      nickname: formData.get('nickname') as string,
                      emailOrPhone: formData.get('emailOrPhone') as string,
                    });
                  }} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        pN Name
                      </label>
                      <input
                        name="pnName"
                        type="text"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your pN Name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Passcode
                      </label>
                      <input
                        name="passcode"
                        type="password"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your passcode"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Nickname
                      </label>
                      <input
                        name="nickname"
                        type="text"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your nickname"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-primary mb-1">
                        Recovery Contact
                      </label>
                      <input
                        name="emailOrPhone"
                        type="text"
                        className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Enter your email or phone number"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2 modal-button rounded-md font-medium"
                    >
                      Submit Recovery Request
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Custodian Modal */}
        {showAddCustodianModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Add Recovery Custodian</h2>
                  <button 
                  onClick={() => setShowAddCustodianModal(false)}
                  className="modal-close-button"
                >
                  ✕
                  </button>
                </div>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const custodianData = {
                  name: formData.get('name') as string,
                  contactType: formData.get('contactType') as 'email' | 'phone',
                  contactValue: formData.get('contactValue') as string,
                  type: formData.get('type') as 'person' | 'service' | 'self'
                };
                
                // Add custodian as pending only
                await handleAddCustodian(custodianData);
              }} className="space-y-4">
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Custodian Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter custodian's full name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Contact Type *
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="contactType"
                        value="email"
                        defaultChecked
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Email</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="contactType"
                        value="phone"
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Phone</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Contact Value *
                  </label>
                  <input
                    type="text"
                    name="contactValue"
                    required
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter email or phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Custodian Type *
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="person"
                        defaultChecked
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Person</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="service"
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Service</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="type"
                        value="self"
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Self</span>
                    </label>
                  </div>
                </div>



                <div className="bg-secondary p-4 rounded-lg">
                  <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  About Custodians
                </h4>
                  <div className="text-sm text-text-secondary space-y-1">
                    <p>• Custodians can help you recover your identity if you lose access</p>
                    <p>• You need at least 2 custodians to enable recovery</p>
                    <p>• Maximum 5 custodians allowed</p>
                    <p>• Custodians will be notified when you initiate recovery</p>
                    <p>• They can approve recovery requests</p>
                    <p>• Custodians start as &quot;pending&quot; until they accept the invitation</p>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowAddCustodianModal(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Add Custodian
                </div>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Recovery Key Generation Modal */}
        {showRecoveryKeyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Generate Recovery Key</h2>
                <button
                  onClick={() => setShowRecoveryKeyModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                  <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Purpose
                  </label>
                  <select
                    value={recoveryKeyForm.purpose}
                    onChange={(e) => setRecoveryKeyForm(prev => ({ ...prev, purpose: e.target.value as RecoveryKey['purpose'] }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="personal">Personal Backup</option>
                    <option value="legal">Legal/Will</option>
                    <option value="insurance">Insurance</option>
                    <option value="will">Estate Planning</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Description (Optional)
                    </label>
                    <input
                      type="text"
                    value={recoveryKeyForm.description}
                    onChange={(e) => setRecoveryKeyForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Safe deposit box, Lawyer's office"
                  />
                  </div>
                <div className="info-box p-3 rounded-md">
                  <p className="text-sm">
                    <strong>Important:</strong> Recovery keys trigger the custodian approval process. 
                    They do not directly unlock your identity. Store them securely and consider providing 
                    copies to trusted individuals or legal entities.
                  </p>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleGenerateRecoveryKey(recoveryKeyForm.purpose, recoveryKeyForm.description)}
                    className="flex-1 px-4 py-2 modal-button rounded-md font-medium"
                  >
                    Generate Key
                  </button>
                  <button
                    onClick={() => setShowRecoveryKeyModal(false)}
                    className="px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-hover font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Add Device Modal */}
        {showAddDeviceModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Add Synced Device</h2>
                <button
                  onClick={() => setShowAddDeviceModal(false)}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleAddDevice({
                  name: formData.get('name') as string,
                  type: formData.get('type') as 'mobile' | 'desktop' | 'tablet' | 'other',
                });
                setShowAddDeviceModal(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Device Name
                  </label>
                  <input
                    name="name"
                    type="text"
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., iPhone 13, MacBook Pro, iPad"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Device Type
                  </label>
                  <select
                    name="type"
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
                    <option value="mobile">Mobile (Phone)</option>
                    <option value="desktop">Desktop (Computer)</option>
                    <option value="tablet">Tablet</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="info-box p-4 rounded-lg">
                  <h4 className="font-medium text-text-primary mb-2">Device Sync</h4>
                  <div className="text-sm text-text-secondary space-y-1">
                    <p>• Device will be synced with your identity</p>
                    <p>• Data will be encrypted in transit</p>
                    <p>• You can remove devices at any time</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Add Device
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddDeviceModal(false)}
                    className="flex-1 px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-hover"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Recovery Key Input Modal */}
        {showRecoveryKeyInputModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Recover with Key</h2>
                <button
                  onClick={() => setShowRecoveryKeyInputModal(false)}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Recovery Key
                  </label>
                  <textarea
                    value={recoveryKeyInput}
                    onChange={(e) => setRecoveryKeyInput(e.target.value)}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Paste your recovery key here"
                    rows={4}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={recoveryKeyContactInfo.claimantName}
                    onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                      ...prev,
                      claimantName: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your full name"
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    This is who will be claiming the identity
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Contact Type
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="contactType"
                        value="email"
                        checked={recoveryKeyContactInfo.contactType === 'email'}
                        onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                          ...prev,
                          contactType: e.target.value as 'email' | 'phone'
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Email</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="contactType"
                        value="phone"
                        checked={recoveryKeyContactInfo.contactType === 'phone'}
                        onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                          ...prev,
                          contactType: e.target.value as 'email' | 'phone'
                        }))}
                        className="mr-2"
                      />
                      <span className="text-sm text-text-primary">Phone</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Contact Value
                  </label>
                  <input
                    type="text"
                    value={recoveryKeyContactInfo.contactValue}
                    onChange={(e) => setRecoveryKeyContactInfo(prev => ({
                      ...prev,
                      contactValue: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your email or phone number"
                    required
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      handleInitiateRecoveryWithKey(recoveryKeyInput, {
                        contactType: recoveryKeyContactInfo.contactType,
                        contactValue: recoveryKeyContactInfo.contactValue,
                        claimantName: recoveryKeyContactInfo.claimantName,
                      });
                      setShowRecoveryKeyInputModal(false);
                    }}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Submit Recovery Request
                  </button>
                  <button
                    onClick={() => setShowRecoveryKeyInputModal(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}



        {authenticatedUser && (
          <div className="max-w-6xl mx-auto text-text-primary pt-8">
            {/* Simple Header for Authenticated Users */}
            <div className="flex justify-center items-center mb-8">
              <div className="w-[270px] h-[270px]">
              <Logo />
              </div>
            </div>
            
            {/* Authenticated Dashboard */}
            <div className="flex flex-col items-center gap-8 -mt-4 relative z-10">
              {/* User Profile */}
              <div className="bg-modal-bg rounded-lg shadow p-8 text-text-primary w-full max-w-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
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
                        className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 dark:bg-primary text-white rounded-full flex items-center justify-center hover:bg-blue-700 dark:hover:bg-primary-dark transition-colors shadow-lg hover:shadow-xl"
                        title="Edit profile picture"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                    </div>
                    {/* Edit Profile Picture Button */}
                    <button
                      onClick={() => setShowProfilePictureEditor(true)}
                      className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 dark:bg-primary text-white rounded-full flex items-center justify-center hover:bg-blue-700 dark:hover:bg-primary-dark transition-colors shadow-lg hover:shadow-xl"
                      title="Edit profile picture"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  </div>
                    <div className="flex-1">
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
                          <div className="flex items-center space-x-2 flex-1">
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
                              className="flex-1 text-xl font-semibold bg-transparent border-b-2 border-primary text-text-primary focus:outline-none focus:border-primary-dark"
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setShowOnboardingWizard(true)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition-colors text-sm"
                      title="Show onboarding wizard"
                    >
                      Help
                    </button>
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
              <div className="bg-modal-bg rounded-lg shadow p-8 text-text-primary w-full max-w-4xl">
                {/* Tab Navigation */}
                <div className="border-b border-border mb-6">
                  <nav className="-mb-px flex space-x-8 overflow-x-auto justify-center">
                <button
                      onClick={() => setActiveTab('privacy')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === 'privacy'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Privacy & Sharing
                </button>
                    <button
                      onClick={() => setActiveTab('devices')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === 'devices'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Synced Devices
                    </button>
                    <button
                      onClick={() => setActiveTab('recovery')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === 'recovery'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Recovery Tool
                    </button>
                    <button
                      onClick={() => setActiveTab('export')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === 'export'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Export Identity
                    </button>
                    <button
                      onClick={() => setActiveTab('security')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                        activeTab === 'security'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      Security
                    </button>
                    {!pwaState.isInstalled && (
                      <button
                        onClick={() => setActiveTab('developer')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                          activeTab === 'developer'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                        }`}
                      >
                        Developer Portal
                      </button>
                    )}
                  </nav>
              </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                  {activeTab === 'privacy' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Privacy & Sharing Settings</h3>
                        
                        {/* Global Settings */}
                        <div className="bg-secondary p-4 rounded-lg mb-6">
                          <h4 className="font-medium text-text-primary mb-3">Global Settings</h4>
                          
                          {/* Master Override */}
                          <div className="mb-4 pb-4 border-b border-border">
                            <label className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">Allow All Tool Access</div>
                                <div className="text-xs text-text-secondary">Override all tool permissions</div>
                              </div>
                              <input
                                type="checkbox"
                                checked={privacySettings.allowAllToolAccess}
                                onChange={(e) => setPrivacySettings({
                                  ...privacySettings,
                                  allowAllToolAccess: e.target.checked
                                })}
                                className="ml-4"
                              />
                            </label>
                          </div>

                          {/* Dynamic Data Point Settings */}
                          {Object.keys(privacySettings.dataPoints).length > 0 ? (
                            <div>
                              <h5 className="text-sm font-medium text-text-primary mb-3">Data Point Permissions</h5>
                              <div className="space-y-3">
                                {Object.entries(privacySettings.dataPoints).map(([dataPointKey, dataPoint]) => (
                                  <label key={dataPointKey} className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm">{dataPoint.label}</div>
                                      <div className="text-xs text-text-secondary">{dataPoint.description}</div>
                                      <div className="text-xs text-text-secondary mt-1">
                                        Requested by: {dataPoint.requestedBy.join(', ')}
                                      </div>
                                    </div>
                                    <input
                                      type="checkbox"
                                      checked={dataPoint.globalSetting}
                                      onChange={(e) => setPrivacySettings({
                                        ...privacySettings,
                                        dataPoints: {
                                          ...privacySettings.dataPoints,
                                          [dataPointKey]: {
                                            ...dataPoint,
                                            globalSetting: e.target.checked
                                          }
                                        }
                                      })}
                                      disabled={privacySettings.allowAllToolAccess}
                                      className="ml-4"
                                    />
                                  </label>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4 text-text-secondary">
                              <p className="text-sm">No data points available</p>
                              <p className="text-xs">Data points will appear here as tools request access</p>
                            </div>
                          )}
                        </div>

                        {/* Tool Permissions */}
                        <div className="bg-secondary p-4 rounded-lg">
                          <h4 className="font-medium text-text-primary mb-3">Third-Party Tools</h4>
                          {Object.keys(privacySettings.toolPermissions).length === 0 ? (
                            <div className="text-center py-4 text-text-secondary">
                              <p className="text-sm">No tools connected yet</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {Object.entries(privacySettings.toolPermissions).map(([toolId, tool]) => (
                                <div key={toolId} className="border border-border rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">{tool.toolName}</div>
                                      <div className="text-xs text-text-secondary">{tool.toolDescription}</div>
                                      <div className="text-xs text-text-secondary mt-1">
                                        {tool.dataPoints.length} data points • {tool.status}
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <button
                                        onClick={() => handleOpenToolSettings(toolId)}
                                        className="text-primary hover:text-primary-dark text-xs font-medium"
                                      >
                                        Settings
                                      </button>
                                      <button
                                        onClick={() => handleDeactivateTool(toolId)}
                                        className="text-red-600 hover:text-red-800 text-xs font-medium"
                                      >
                                        {tool.status === 'active' ? 'Deactivate' : 'Delete'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'devices' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Synced Devices</h3>
                        <div className="space-y-4">
                          {/* Device List */}
                          <div className="space-y-3">
                            {syncedDevices.map((device) => (
                              <div key={device.id} className="bg-input-bg rounded-lg border border-border p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center space-x-3">
                                    <div className={`w-3 h-3 rounded-full ${device.isPrimary ? 'bg-primary' : 'bg-blue-500'}`}></div>
                                    <div>
                                      <div className="font-medium text-sm flex items-center space-x-2">
                                        <span className="text-text-primary">{device.name}</span>
                                        {device.isPrimary && (
                                          <span className="text-xs text-black px-2 py-1">
                                            Primary
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-text-secondary">
                                        {device.type} • {device.location} • {device.ipAddress}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-text-secondary">
                                      Last sync: {new Date(device.lastSync).toLocaleString()}
                                    </div>
                                    <div className={`text-xs px-2 py-1 ${
                                      device.status === 'active' 
                                        ? 'text-primary' 
                                        : 'text-red-600'
                                    }`}>
                                      {device.status}
                                    </div>
                                  </div>
                                </div>
                                
                                {!device.isPrimary && (
                                  <div className="flex space-x-2 mt-3">
                                    <button
                                      onClick={() => handleRemoveDevice(device.id)}
                                      className="px-3 py-1 bg-red-600 btn-text rounded text-sm hover:bg-red-700"
                                    >
                                      Remove
                                    </button>
                                    <button
                                      onClick={() => {
                                        // Simulate sync
                                        const updatedDevices = syncedDevices.map(d => 
                                          d.id === device.id 
                                            ? { ...d, lastSync: new Date().toISOString() }
                                            : d
                                        );
                                        setSyncedDevices(updatedDevices);
                                        setSuccess('Device synced successfully');
                                        setTimeout(() => setSuccess(null), 5000);
                                      }}
                                      className="px-3 py-1 bg-blue-600 btn-text rounded text-sm hover:bg-blue-700"
                                    >
                                      Sync Now
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          
                          {/* Add New Device Button */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2">Add New Device</h4>
                            <p className="text-sm text-text-secondary mb-3">
                              Generate a QR code to pair a new device with your identity.
                            </p>
                            <button 
                              onClick={() => setShowAddDeviceModal(true)}
                              className="w-full px-4 py-3 modal-button rounded-md text-sm"
                            >
                              Add New Device
                            </button>
                          </div>
                          
                          {/* Info Button */}
                          <button
                            onClick={() => setShowDeviceInfoModal(true)}
                            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                          >
                            <Info className="w-4 h-4" />
                            <span className="text-sm">Device Sync Information</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'recovery' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery & Devices</h3>
                        <div className="space-y-4">
                          {/* Recovery Configuration */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2">Recovery Configuration</h4>
                            
                            {/* Recovery Status */}
                            {custodians.filter(c => c.status === 'active').length < recoveryThreshold ? (
                              <div className="mb-4 p-3 bg-secondary border border-border rounded text-text-primary text-sm">
                                <h5 className="font-medium mb-1 text-yellow-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Recovery Not Ready
                </h5>
                                <p className="text-text-secondary">
                                  You need {recoveryThreshold - custodians.filter(c => c.status === 'active').length} more active custodians 
                                  to enable recovery. Add more custodians or verify pending ones.
                                  {custodians.filter(c => c.status === 'pending').length > 0 && (
                                    <span className="block mt-1 text-yellow-400">
                                      <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {custodians.filter(c => c.status === 'pending').length} pending custodians need to accept invitation via QR code
                                      </div>
                                    </span>
                                  )}
                                </p>
                              </div>
                            ) : (
                              <div className="mb-4 p-3 bg-secondary border border-border rounded text-text-primary text-sm">
                                <h5 className="font-medium mb-1 text-green-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Recovery Ready
                </h5>
                                <p className="text-text-secondary">
                                  Your identity is protected! You can recover access with {recoveryThreshold} custodian approvals.
                                </p>
                              </div>
                            )}
                            
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-text-secondary">Threshold (approvals needed):</span>
                                  <span className="text-sm font-medium text-text-primary">{recoveryThreshold} of 5</span>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-text-secondary">Select threshold:</span>
                                  <select
                                    value={recoveryThreshold}
                                    onChange={(e) => setRecoveryThreshold(parseInt(e.target.value))}
                                    className="flex-1 px-3 py-1 border border-input-border bg-input-bg rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                  >
                                    <option value={2}>2 approvals</option>
                                    <option value={3}>3 approvals</option>
                                    <option value={4}>4 approvals</option>
                                    <option value={5}>5 approvals</option>
                                  </select>
                                </div>
                              </div>
                              <div className="text-sm text-text-secondary space-y-1">
                                <div>• Self-recovery custodians: {getSelfCustodiansCount()}/2</div>
                                <div>• Third-party custodians: {getThirdPartyCustodiansCount()}/5</div>
                                <div className="text-xs text-text-secondary mt-2">
                                  Total maximum: 5 custodians • Minimum required: {recoveryThreshold} custodians
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Recovery Custodians */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-text-primary">Recovery Custodians</h4>
                              <button 
                                onClick={() => setShowAddCustodianModal(true)}
                                disabled={custodians.length >= 5}
                                className="px-3 py-1 modal-button rounded-md disabled:opacity-50 text-sm"
                              >
                                Add Custodian ({custodians.length}/5)
                              </button>
                            </div>
                            {custodians.filter(c => c.status === 'pending').length > 0 && (
                              <div className="mb-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-sm">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4" />
                                  {custodians.filter(c => c.status === 'pending').length} pending custodians need to accept invitation via QR code
                                </div>
                              </div>
                            )}
                            <div className="space-y-3">
                              {custodians.length === 0 ? (
                                <div className="text-center py-4">
                                  <p className="text-text-secondary mb-3">No custodians added yet</p>
                                  <button 
                                    onClick={() => setShowAddCustodianModal(true)}
                                    className="px-4 py-2 modal-button rounded-md text-sm"
                                  >
                                    Add Your First Custodian
                                  </button>
                                </div>
                              ) : (
                                custodians.map((custodian) => (
                                  <div key={custodian.id} className="flex items-center justify-between p-3 bg-input-bg rounded border border-border">
                                    <div className="flex items-center space-x-3">
                                      <div className={`w-3 h-3 rounded-full ${
                                        custodian.status === 'active' ? 'bg-primary' : 'bg-yellow-500'
                                      }`}></div>
                                      <div>
                                        <div className="font-medium text-sm text-text-primary">{custodian.name}</div>
                                        <div className="text-xs text-text-secondary">
                                          {custodian.identityId} • {custodian.type} • Added {new Date(custodian.addedAt).toLocaleDateString()}
                                          {custodian.lastVerified && ` • Verified ${new Date(custodian.lastVerified).toLocaleDateString()}`}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className={`text-xs px-2 py-1 ${
                                        custodian.status === 'active' 
                                          ? 'text-primary' 
                                          : 'text-yellow-600'
                                      }`}>
                                        {custodian.status}
                                      </span>
                                      {custodian.status === 'pending' && (
                                        <button 
                                          onClick={() => {
                                            setSelectedCustodianForInvitation(custodian);
                                            setShowSendInvitationModal(true);
                                          }}
                                          className="text-blue-600 hover:text-blue-800 text-sm"
                                          title="Generate and send invitation QR code"
                                        >
                                          📤 Send Invitation
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => handleRemoveCustodian(custodian.id)}
                                        className="text-red-600 hover:text-red-800 text-sm"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Recovery Keys Section */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="text-md font-semibold text-text-primary">Recovery Keys</h4>
                            <div className="space-y-3">
                              {recoveryKeys.length === 0 ? (
                                <p className="text-text-secondary text-sm">No recovery keys generated yet.</p>
                              ) : (
                                recoveryKeys.map((key) => (
                                  <div key={key.id} className="border border-border rounded-lg p-3">
                                    <p className="font-medium text-text-primary">{key.purpose}</p>
                                    <p className="text-sm text-text-secondary">{key.description || 'No description'}</p>
                                    <p className="text-xs text-text-secondary">Created: {new Date(key.createdAt).toLocaleDateString()}</p>
                                    <div className="mt-2 flex space-x-2">
                                      <button
                                        onClick={() => handleDownloadRecoveryKey(key.id)}
                                        className="px-3 py-1 bg-primary text-bg-primary rounded text-xs hover:bg-hover"
                                      >
                                        Download
                                      </button>
                                      <button
                                        onClick={() => {
                                          // Handle key deletion
                                        }}
                                        className="px-3 py-1 bg-red-600 btn-text rounded text-xs hover:bg-red-700"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                              <button
                                onClick={() => setShowRecoveryKeyModal(true)}
                                className="w-full px-4 py-2 modal-button rounded-md text-sm"
                              >
                                Generate New Recovery Key
                              </button>
                            </div>
                          </div>

                          {/* Custodianships Section */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2">IDs You Are a Custodian Of</h4>
                            {custodianships.length === 0 ? (
                              <p className="text-text-secondary text-sm">You are not a custodian for any IDs.</p>
                            ) : (
                              <div className="space-y-3">
                                {custodianships.map(cs => {
                                  // Find if there is a pending recovery request for this ID
                                  const pendingRequest = recoveryRequests.find(r => r.requestingDid === cs.identityId && r.status === 'pending');
                                  return (
                                    <div key={cs.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                                      <div>
                                        <div className="font-medium text-text-primary">{cs.identityName} <span className="text-xs text-text-secondary">({cs.identityUsername})</span></div>
                                        <div className="text-xs text-text-secondary">ID: {cs.identityId}</div>
                                      </div>
                                      <button
                                        className={`px-3 py-1 rounded text-xs font-medium ${pendingRequest && cs.canApprove ? 'bg-primary text-bg-primary hover:bg-hover' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                                        disabled={!(pendingRequest && cs.canApprove)}
                                        title={pendingRequest && cs.canApprove ? 'Approve or deny recovery' : 'No active recovery request'}
                                        onClick={() => handleOpenCustodianApprovalModal(cs)}
                                      >
                                        Recover
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>



                          {/* Recovery Instructions */}
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  How Recovery Works
                </h4>
                            <div className="text-sm text-text-secondary space-y-1">
                              <p>• Add trusted Identity Protocol users as custodians</p>
                              <p>• Set how many custodians must approve recovery (2-5)</p>
                              <p>• Generate recovery keys for secure backup</p>
                              <p>• <strong>Recovery Keys:</strong> Trigger custodian approval with contact verification</p>
                              <p>• <strong>4-Factor Recovery:</strong> pN Name, Passcode, Nickname, Email/Phone</p>
                              <p>• Custodians receive automatic notifications in their dashboard</p>
                              <p>• Each custodian can approve/deny with one click</p>
                              <p>• Once threshold is met, your identity is recovered</p>
                              <p>• <strong>Security:</strong> Recovery keys don&apos;t unlock directly - they trigger approval process</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'export' && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-text-primary mb-4">Export PN</h3>
                        <div className="space-y-4">
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2">Backup Options</h4>
                            <div className="space-y-3">
                              <button 
                                onClick={handleExportData}
                                className="w-full px-4 py-3 modal-button rounded-md text-sm"
                              >
                                Export Encrypted Backup
                              </button>
                            </div>
                          </div>
                          <div className="bg-secondary p-4 rounded-lg">
                            <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Export Information
                </h4>
                            <p className="text-sm text-text-secondary">
                              Exported files are encrypted and can only be imported with your passcode. 
                              Store backups securely and never share your private keys.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Security Tab */}
                  {activeTab === 'security' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-text-primary">Security & Monitoring</h3>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setShowRealtimeSecurityAlerts(true)}
                            className="px-4 py-2 bg-secondary text-text-primary rounded-lg hover:bg-hover transition-colors border border-border shadow-sm"
                          >
                            Real-time Alerts
                          </button>

                          {/* Biometric Setup Button */}
                          {false && (
                            <button
                              onClick={() => setShowBiometricSetup(true)}
                              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                              👆 Set Up Biometric Unlock
                            </button>
                          )}
                          <button
                            onClick={() => setShowSecurityDashboard(true)}
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors border border-primary-dark shadow-sm"
                          >
                            Open Security Dashboard
                          </button>
                        </div>
                      </div>
                      
                      {/* Essential Security Overview - Always Visible */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-secondary rounded-lg p-4">
                          <div className="text-sm text-text-secondary">Account Status</div>
                          <div className="text-lg font-semibold text-green-600">Secure</div>
                        </div>
                        <div className="bg-secondary rounded-lg p-4">
                          <div className="text-sm text-text-secondary">Last Login</div>
                          <div className="text-lg font-semibold text-text-primary">
                            {authenticatedUser ? new Date(authenticatedUser.metadata?.security?.lastLoginAttempt || Date.now()).toLocaleString() : 'Never'}
                          </div>
                        </div>
                        <div className="bg-secondary rounded-lg p-4">
                          <div className="text-sm text-text-secondary">Failed Attempts</div>
                          <div className="text-lg font-semibold text-text-primary">
                            {authenticatedUser?.metadata?.security?.failedLoginAttempts || 0}
                          </div>
                        </div>
                      </div>

                      {/* Security Features - Always Visible */}
                      <div className="bg-secondary rounded-lg p-6">
                        <h4 className="text-md font-semibold mb-4 text-text-primary">Security Features</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Brute Force Protection</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Input Validation</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Rate Limiting</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Threat Detection</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Data Encryption</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-text-primary">Audit Logging</span>
                            <span className="text-green-600">✓ Active</span>
                          </div>
                        </div>
                      </div>

                      {/* Advanced Settings Toggle */}
                      <div className="border border-border rounded-lg">
                        <button
                          onClick={() => setShowAdvancedSecuritySettings(!showAdvancedSecuritySettings)}
                          className="w-full flex items-center justify-between p-4 hover:bg-modal-bg transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <Settings className="w-5 h-5 text-text-secondary" />
                            <span className="font-medium text-text-primary">Advanced Security Settings</span>
                          </div>
                          {showAdvancedSecuritySettings ? (
                            <ChevronUp className="w-5 h-5 text-text-secondary" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-text-secondary" />
                          )}
                        </button>

                        {/* Advanced Settings Content */}
                        {showAdvancedSecuritySettings && (
                          <div className="border-t border-border p-6 space-y-6">
                            {/* Security Settings */}
                            <div>
                              <h4 className="text-md font-semibold mb-4 text-text-primary">Security Settings</h4>
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-text-primary">Session Timeout</div>
                                    <div className="text-sm text-text-secondary">Auto-logout after inactivity</div>
                                  </div>
                                  <select
                                    value={securitySettings.sessionTimeout}
                                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                                    className="px-3 py-1 border border-border rounded bg-modal-bg text-text-primary"
                                  >
                                    <option value={5}>5 minutes</option>
                                    <option value={15}>15 minutes</option>
                                    <option value={30}>30 minutes</option>
                                    <option value={60}>1 hour</option>
                                    <option value={0}>Never</option>
                                  </select>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-text-primary">Max Concurrent Sessions</div>
                                    <div className="text-sm text-text-secondary">Maximum devices logged in</div>
                                  </div>
                                  <select
                                    value={securitySettings.maxConcurrentSessions}
                                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, maxConcurrentSessions: parseInt(e.target.value) }))}
                                    className="px-3 py-1 border border-border rounded bg-modal-bg text-text-primary"
                                  >
                                    <option value={1}>1 device</option>
                                    <option value={2}>2 devices</option>
                                    <option value={3}>3 devices</option>
                                    <option value={5}>5 devices</option>
                                  </select>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-text-primary">Auto-Lock Timeout</div>
                                    <div className="text-sm text-text-secondary">Lock app after inactivity</div>
                                  </div>
                                  <select
                                    value={securitySettings.autoLockTimeout}
                                    onChange={(e) => setSecuritySettings(prev => ({ ...prev, autoLockTimeout: parseInt(e.target.value) }))}
                                    className="px-3 py-1 border border-border rounded bg-modal-bg text-text-primary"
                                  >
                                    <option value={1}>1 minute</option>
                                    <option value={5}>5 minutes</option>
                                    <option value={15}>15 minutes</option>
                                    <option value={30}>30 minutes</option>
                                  </select>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-text-primary">Security Notifications</div>
                                    <div className="text-sm text-text-secondary">Get alerts for suspicious activity</div>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={securitySettings.enableNotifications}
                                      onChange={(e) => setSecuritySettings(prev => ({ ...prev, enableNotifications: e.target.checked }))}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-text-primary">Remember Me</div>
                                    <div className="text-sm text-text-secondary">Stay logged in on this device</div>
                                  </div>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={securitySettings.allowRememberMe}
                                      onChange={(e) => setSecuritySettings(prev => ({ ...prev, allowRememberMe: e.target.checked }))}
                                      className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                  </label>
                                </div>
                              </div>
                            </div>

                            {/* Active Sessions */}
                            <div>
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="text-md font-semibold text-text-primary">Active Sessions</h4>
                                <button
                                  onClick={() => setShowSessionManager(true)}
                                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                                >
                                  View All Sessions
                                </button>
                              </div>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-2xl">💻</span>
                                    <div>
                                      <div className="font-medium text-text-primary">MacBook Pro</div>
                                      <div className="text-sm text-text-secondary">Current session • San Francisco, CA</div>
                                    </div>
                                  </div>
                                  <span className="text-xs bg-primary text-white px-2 py-1 rounded">Current</span>
                                </div>
                                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                                  <div className="flex items-center space-x-3">
                                    <Smartphone className="w-8 h-8" />
                                    <div>
                                      <div className="font-medium text-text-primary">iPhone 15</div>
                                      <div className="text-sm text-text-secondary">Last active 30 minutes ago • San Francisco, CA</div>
                                    </div>
                                  </div>
                                  <button className="text-xs text-red-500 hover:text-red-600">Terminate</button>
                                </div>
                                <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                                  <div className="flex items-center space-x-3">
                                    <Monitor className="w-8 h-8" />
                                    <div>
                                      <div className="font-medium text-text-primary">Unknown Device</div>
                                      <div className="text-sm text-text-secondary">Last active 2 hours ago • Unknown location</div>
                                    </div>
                                  </div>
                                  <button className="text-xs text-red-500 hover:text-red-600">Terminate</button>
                                </div>
                              </div>
                              <div className="mt-4 pt-4 border-t border-border">
                                <button className="text-sm text-red-500 hover:text-red-600">
                                  Terminate All Other Sessions
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Developer Portal Tab */}
                  {activeTab === 'developer' && !pwaState.isInstalled && (
                    <DeveloperPortal />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Device QR Code Modal */}
        {showDeviceQRModal && deviceSyncData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Add New Device</h2>
                <button 
                  onClick={() => setShowDeviceQRModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="text-lg font-medium mb-4">Scan This QR Code on Your New Device</h3>
                  <div className="bg-gray-100 p-4 rounded-lg inline-block">
                    {deviceSyncData.qrCodeDataURL ? (
                      <img 
                        src={deviceSyncData.qrCodeDataURL} 
                        alt="Device Sync QR Code"
                        className="w-48 h-48 border border-gray-300"
                      />
                    ) : (
                      <div className="w-48 h-48 bg-gray-200 flex items-center justify-center border-2 border-dashed border-gray-400">
                        <div className="text-center text-gray-700">
                          <div className="flex justify-center mb-2">
                  <Smartphone className="w-12 h-12 text-blue-500" />
                </div>
                          <div className="text-sm">QR Code</div>
                          <div className="text-xs mt-1">Scan with new device</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-100 p-4 rounded-lg">
                  <h4 className="font-medium text-black mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Device Information
                </h4>
                  <div className="text-sm text-black space-y-1">
                    <p>• Device: {deviceSyncData.deviceName}</p>
                    <p>• Type: {deviceSyncData.deviceType}</p>
                    <p>• Sync Key: {deviceSyncData.syncKey.substring(0, 8)}...</p>
                    <p>• Expires: {new Date(deviceSyncData.expiresAt).toLocaleTimeString()}</p>
                    <p>• <strong>Security:</strong> QR code expires in 5 minutes</p>
                    <p>• <strong>Encryption:</strong> All data synced between devices is encrypted</p>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowDeviceQRModal(false)}
                                                    className="flex-1 px-4 py-2 bg-gray-600 btn-text rounded-md hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      // Simulate successful pairing for demo
                      const newDevice: SyncedDevice = {
                        id: deviceSyncData.deviceId,
                        name: deviceSyncData.deviceName,
                        type: deviceSyncData.deviceType,
                        lastSync: new Date().toISOString(),
                        status: 'active',
                        location: 'San Francisco, CA',
                        ipAddress: '192.168.1.101',
                        isPrimary: false,
                        deviceFingerprint: generateDeviceFingerprint(),
                        syncKey: deviceSyncData.syncKey,
                        pairedAt: new Date().toISOString()
                      };
                      setSyncedDevices(prev => [...prev, newDevice]);
                      setShowDeviceQRModal(false);
                      setSuccess('Device paired successfully');
                      setTimeout(() => setSuccess(null), 5000);
                    }}
                                                    className="flex-1 px-4 py-2 bg-blue-600 btn-text rounded-md hover:bg-blue-700"
                  >
                    Simulate Pairing
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Custodian Invitation Acceptance Modal */}
        {showCustodianInvitationModal && pendingCustodianInvitation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Custodian Invitation</h2>
                <button 
                  onClick={() => {
                    setShowCustodianInvitationModal(false);
                    setPendingCustodianInvitation(null);
                  }}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Invitation Details */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h3 className="font-medium text-text-primary mb-2">Invitation Details</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-text-secondary">Identity:</span> <span className="font-medium">{pendingCustodianInvitation.identityName}</span></div>
                    <div><span className="text-text-secondary">pN Name:</span> <span className="font-medium">{pendingCustodianInvitation.identityUsername}</span></div>
                    <div><span className="text-text-secondary">Custodian Name:</span> <span className="font-medium">{pendingCustodianInvitation.custodianName}</span></div>
                    <div><span className="text-text-secondary">Type:</span> <span className="font-medium">{pendingCustodianInvitation.custodianType}</span></div>
                    <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{pendingCustodianInvitation.contactValue} ({pendingCustodianInvitation.contactType})</span></div>
                  </div>
                </div>

                {/* What This Means */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  What This Means
                </h4>
                  <div className="text-sm text-blue-700 space-y-1">
                    <p>• You&apos;re being asked to be a recovery custodian for this identity</p>
                    <p>• You&apos;ll be able to approve or deny recovery requests</p>
                    <p>• You&apos;ll receive notifications when recovery is requested</p>
                    <p>• This is a trusted role - only accept if you know the identity owner</p>
                  </div>
                </div>

                {/* Requirements */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Requirements
                </h4>
                  <div className="text-sm text-yellow-700 space-y-1">
                    <p>• You must have your own identity unlocked to accept</p>
                    <p>• You&apos;ll need to verify your contact information</p>
                    <p>• You can revoke this custodianship at any time</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowCustodianInvitationModal(false);
                      setPendingCustodianInvitation(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleCustodianInvitationAcceptance(pendingCustodianInvitation)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Accept Custodianship
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Send Custodian Invitation Modal */}
        {showSendInvitationModal && selectedCustodianForInvitation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Send Custodian Invitation</h2>
                <button 
                  onClick={() => {
                    setShowSendInvitationModal(false);
                    setSelectedCustodianForInvitation(null);
                    setCustodianQRCode('');
                    setCustodianContactInfo({
                      name: '',
                      contactType: 'email',
                      contactValue: '',
                      type: 'person'
                    });
                  }}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Custodian Details */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h3 className="font-medium text-text-primary mb-2">Custodian Details</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{selectedCustodianForInvitation.name}</span></div>
                    <div><span className="text-text-secondary">Type:</span> <span className="font-medium">{selectedCustodianForInvitation.type}</span></div>
                    <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{selectedCustodianForInvitation.contactValue} ({selectedCustodianForInvitation.contactType})</span></div>
                    <div><span className="text-text-secondary">Status:</span> <span className="font-medium text-yellow-600">Pending</span></div>
                  </div>
                </div>

                {/* QR Code Section */}
                {!custodianQRCode ? (
                  <div className="bg-secondary p-4 rounded-lg">
                    <h4 className="font-medium text-text-primary mb-3 flex items-center gap-2">
                  <QrCode className="w-5 h-5" />
                  Generate Invitation
                </h4>
                    <p className="text-sm text-text-secondary mb-4">
                      Generate a QR code invitation for {selectedCustodianForInvitation.name}. 
                      This will create an encrypted invitation that they can scan to accept custodianship.
                    </p>
                    <button
                      onClick={async () => {
                        const custodianData = {
                          name: selectedCustodianForInvitation.name,
                          contactType: selectedCustodianForInvitation.contactType,
                          contactValue: selectedCustodianForInvitation.contactValue,
                          type: selectedCustodianForInvitation.type
                        };
                        await generateCustodianQRCode(custodianData);
                      }}
                      className="w-full px-4 py-2 modal-button rounded-md"
                    >
                      <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Generate QR Code
                </div>
                    </button>
                  </div>
                ) : (
                  <div className="bg-secondary p-4 rounded-lg">
                    <h4 className="font-medium text-text-primary mb-3 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Send Invitation
                </h4>
                    <div className="space-y-4">
                      {/* QR Code */}
                      <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-lg">
                          <img 
                            src={custodianQRCode} 
                            alt="Custodian Invitation QR Code" 
                            className="w-48 h-48"
                          />
                        </div>
                      </div>
                      
                      {/* Contact Buttons */}
                      <div className="flex space-x-3">
                        {custodianContactInfo.contactType === 'email' ? (
                          <button
                            onClick={() => handleContactAction('email', custodianContactInfo.contactValue)}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          >
                            📧 Send Email
                          </button>
                        ) : (
                          <button
                            onClick={() => handleContactAction('phone', custodianContactInfo.contactValue)}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Send Text
                </div>
                          </button>
                        )}
                      </div>
                      
                      <div className="text-xs text-text-secondary text-center">
                        <p>• Share the QR code with {selectedCustodianForInvitation.name}</p>
                        <p>• They can scan it to accept the custodianship</p>
                        <p>• The invitation is encrypted with their contact information</p>
                        <p>• You can regenerate the QR code if needed</p>
                      </div>
                      
                      {/* Regenerate Button */}
                      <button
                        onClick={async () => {
                          const custodianData = {
                            name: selectedCustodianForInvitation.name,
                            contactType: selectedCustodianForInvitation.contactType,
                            contactValue: selectedCustodianForInvitation.contactValue,
                            type: selectedCustodianForInvitation.type
                          };
                          await generateCustodianQRCode(custodianData);
                        }}
                        className="w-full px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-hover transition-colors"
                      >
                        <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Regenerate QR Code
                </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* Instructions */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  How It Works
                </h4>
                  <div className="text-sm text-text-secondary space-y-1">
                    <p>• Generate a QR code invitation for your custodian</p>
                    <p>• Send the QR code via email, text, or any method you prefer</p>
                    <p>• When they scan the QR code, they&apos;ll be prompted to accept</p>
                    <p>• Once accepted, their status will change from &quot;pending&quot; to &quot;active&quot;</p>
                    <p>• Active custodians can approve recovery requests</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custodian Approval Modal */}
        {showCustodianApprovalModal && selectedRecoveryRequest && selectedCustodianship && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold">Recovery Approval Request</h2>
                <button 
                  onClick={() => setShowCustodianApprovalModal(false)}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Identity Information */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h3 className="font-medium text-text-primary mb-2">Identity Details</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-text-secondary">Name:</span> <span className="font-medium">{selectedCustodianship.identityName}</span></div>
                    <div><span className="text-text-secondary">Username:</span> <span className="font-medium">{selectedCustodianship.identityUsername}</span></div>
                    <div><span className="text-text-secondary">ID:</span> <span className="font-mono text-xs">{selectedCustodianship.identityId}</span></div>
                  </div>
                </div>

                {/* Recovery Request Details */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h3 className="font-medium text-text-primary mb-2">Recovery Request</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-text-secondary">Requested by:</span> <span className="font-medium">{selectedRecoveryRequest.requestingUser}</span></div>
                    <div><span className="text-text-secondary">Requested at:</span> <span className="font-medium">{new Date(selectedRecoveryRequest.timestamp).toLocaleString()}</span></div>
                    {selectedRecoveryRequest.claimantContactType && (
                      <div><span className="text-text-secondary">Contact:</span> <span className="font-medium">{selectedRecoveryRequest.claimantContactValue} ({selectedRecoveryRequest.claimantContactType})</span></div>
                    )}
                    <div><span className="text-text-secondary">Status:</span> <span className={`font-medium ${selectedRecoveryRequest.status === 'pending' ? 'text-yellow-600' : selectedRecoveryRequest.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                      {selectedRecoveryRequest.status.charAt(0).toUpperCase() + selectedRecoveryRequest.status.slice(1)}
                    </span></div>
                  </div>
                </div>

                {/* Approval Status */}
                <div className="bg-secondary p-4 rounded-lg">
                  <h3 className="font-medium text-text-primary mb-2">Approval Status</h3>
                  <div className="space-y-2 text-sm">
                    <div><span className="text-text-secondary">Approvals:</span> <span className="font-medium text-green-600">{selectedRecoveryRequest.approvals.length}</span></div>
                    <div><span className="text-text-secondary">Required:</span> <span className="font-medium">{recoveryThreshold} approvals</span></div>
                  </div>
                </div>

                {/* Security Warning */}
                <div className="bg-secondary border border-border rounded-lg p-4">
                  <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Security Notice
                </h4>
                  <div className="text-sm text-text-secondary space-y-1">
                    <p>• Only approve if you recognize the claimant</p>
                    <p>• Verify their contact information matches your records</p>
                    <p>• Your approval will grant them access to the identity</p>
                    <p>• If you don&apos;t recognize them, simply close without approving</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowCustodianApprovalModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      handleApproveRecovery(selectedRecoveryRequest.id, selectedCustodianship.id);
                      setShowCustodianApprovalModal(false);
                      setSuccess('Recovery request approved successfully');
                      setTimeout(() => setSuccess(null), 5000);
                    }}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recovery Completion Modal */}
        {showRecoveryCompleteModal && recoveredDID && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Recovery Successful!</h2>
                <button 
                  onClick={() => setShowRecoveryCompleteModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-6xl mb-4 flex justify-center">
                  <PartyPopper className="w-16 h-16 text-green-500" />
                </div>
                  <h3 className="text-lg font-medium mb-2">Identity Recovered!</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Your identity <strong>{recoveredDID.nickname}</strong> has been successfully recovered.
                  </p>
                </div>
                
                <div className="bg-secondary p-4 rounded-lg">
                  <h4 className="font-medium text-text-primary mb-2 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5" />
                  Primary Device Setup
                </h4>
                  <div className="text-sm text-text-secondary space-y-2">
                    <p>• <strong>Current Device:</strong> {navigator.platform} - {navigator.userAgent.split(' ').pop()?.split('/')[0] || 'Unknown'}</p>
                    <p>• <strong>Action:</strong> This device will become your new primary device</p>
                    <p>• <strong>Security:</strong> All previous devices will be disconnected</p>
                    <p>• <strong>Sync:</strong> Your data will sync to this device</p>
                  </div>
                </div>
                
                <div className="bg-gray-100 p-4 rounded-lg">
                  <h4 className="font-medium text-black mb-2 flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  What Happens Next
                </h4>
                  <div className="text-sm text-black space-y-1">
                    <p>• This device becomes your new primary device</p>
                    <p>• All previous synced devices will be disconnected</p>
                    <p>• You can add new devices using QR codes</p>
                    <p>• Your identity data will be restored to this device</p>
                    <p>• <strong>Security:</strong> Previous devices lose access immediately</p>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowRecoveryCompleteModal(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleRecoveryComplete(recoveredDID);
                      setShowRecoveryCompleteModal(false);
                    }}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Set as Primary Device
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* Security Dashboard Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <SecurityDashboard
            isOpen={showSecurityDashboard}
            onClose={() => setShowSecurityDashboard(false)}
          />
        </Suspense>

        {/* Session Manager Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <SessionManager
            isOpen={showSessionManager}
            onClose={() => setShowSessionManager(false)}
          />
        </Suspense>

        {/* Real-time Security Alerts Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <RealtimeSecurityAlerts
            isOpen={showRealtimeSecurityAlerts}
            onClose={() => setShowRealtimeSecurityAlerts(false)}
          />
        </Suspense>

        {/* Migration Modal */}
        <Suspense fallback={<LoadingSpinner />}>
          <MigrationModal
            isOpen={showMigrationModal}
            onClose={() => setShowMigrationModal(false)}
            pendingIdentities={pendingMigrations}
            onMigrationComplete={handleMigrationComplete}
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

        {/* Biometric Setup Modal */}
        {authenticatedUser && (
          <Suspense fallback={<LoadingSpinner />}>
            <BiometricSetup
              isOpen={showBiometricSetup}
              onClose={() => setShowBiometricSetup(false)}
              onSuccess={handleBiometricSetupSuccess}
              identityId={authenticatedUser.id}
              pnName={authenticatedUser.pnName}
            />
          </Suspense>
        )}

        {/* Device Info Modal */}
        {showDeviceInfoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Device Sync Information
                </h3>
                <button 
                  onClick={() => setShowDeviceInfoModal(false)}
                  className="modal-close-button"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="text-sm text-text-secondary space-y-2">
                  <p>• <strong>Primary Device:</strong> {currentDevice?.name || 'This Device'} (marked with green dot)</p>
                  <p>• <strong>QR Code Pairing:</strong> Generate QR code on this device, scan with new device</p>
                  <p>• <strong>Encrypted Sync:</strong> All data synced between devices is encrypted</p>
                  <p>• <strong>Real-time Updates:</strong> Changes sync automatically across all devices</p>
                  <p>• <strong>Device Limits:</strong> Maximum 5 synced devices per identity</p>
                  <p>• <strong>Security:</strong> Only trusted devices can access your identity data</p>
                </div>
                
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowDeviceInfoModal(false)}
                    className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PWA Lock Screen */}
        <Suspense fallback={<LoadingSpinner />}>
          <PWALockScreen
            isLocked={isPWALocked}
            onUnlock={handlePWAUnlock}
            onFallback={handlePWAFallback}
          />
        </Suspense>

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
          onExportRecoveryKey={() => {
            setShowOnboardingWizard(false);
            setShowRecoveryKeyModal(true);
          }}
          onNavigateToSection={(section) => {
            setShowOnboardingWizard(false);
            setActiveTab(section as any);
          }}
        />

      </main>

      {/* Development Mode Indicator */}
      <DevelopmentModeIndicator />

      {/* IPFS Status Indicator */}
      <div className="fixed bottom-4 right-4 z-40">
        <IPFSStatus />
      </div>

    </div>
  );
}

export default App;

