import { useState, useEffect } from 'react';

export function useCustodianState() {
  // Profile editing state
  const [showProfilePictureEditor, setShowProfilePictureEditor] = useState(false);
  const [showNicknameEditor, setShowNicknameEditor] = useState(false);
  const [editingNickname, setEditingNickname] = useState('');

  // Info section state
  const [showRecoveryInfo, setShowRecoveryInfo] = useState(false);
  const [showCustodianInfo, setShowCustodianInfo] = useState(false);

  // Custodian invitation acceptance state
  const [showCustodianAcceptanceModal, setShowCustodianAcceptanceModal] = useState(false);
  const [pendingCustodianInvitationData, setPendingCustodianInvitationData] = useState<any>(null);
  const [custodianAcceptanceData, setCustodianAcceptanceData] = useState({
    contactType: 'email' as 'email' | 'phone',
    contactValue: '',
    passcode: ''
  });

  // Biometric authentication state
  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  // New state for sending invitations
  const [showDeviceInfoModal, setShowDeviceInfoModal] = useState(false);
  const [showUnlockFromUsbModal, setShowUnlockFromUsbModal] = useState(false);
  const [showUnlockFromNfcModal, setShowUnlockFromNfcModal] = useState(false);
  const [hasNfcSupport, setHasNfcSupport] = useState(false);
  const [showSendInvitationModal, setShowSendInvitationModal] = useState(false);

  useEffect(() => {
    import('../utils/nfcAdapter').then((m) => m.isSupported().then(setHasNfcSupport));
  }, []);
  const [selectedCustodianForInvitation, setSelectedCustodianForInvitation] = useState<any>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    pnName: '',
    confirmPNName: '',
    passcode: '',
    confirmPasscode: '',
    nickname: '',
    email: '',
    phone: '',
    recoveryEmail: '',
    confirmRecoveryEmail: '',
    recoveryPhone: '',
    confirmRecoveryPhone: '',
    recoveryContactType: 'email' as 'email' | 'phone'
  });

  // Create step state for multi-step form
  const [createStep, setCreateStep] = useState(1);

  // Show/hide state for create form fields
  const [showPNName, setShowPNName] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const [showConfirmPNName, setShowConfirmPNName] = useState(false);
  const [showConfirmPasscode, setShowConfirmPasscode] = useState(false);
  const [showCreatePasscode, setShowCreatePasscode] = useState(false);
  const [showCreateConfirmPasscode, setShowCreateConfirmPasscode] = useState(false);
  const [showCreateNickname, setShowCreateNickname] = useState(false);
  const [showCreateEmail, setShowCreateEmail] = useState(false);
  const [showCreatePhone, setShowCreatePhone] = useState(false);

  // Show/hide state for main unlock form fields
  const [showUnlockPasscode, setShowUnlockPasscode] = useState(false);
  const [showUnlockNickname, setShowUnlockNickname] = useState(false);
  const [showUnlockEmail, setShowUnlockEmail] = useState(false);
  const [showUnlockPhone, setShowUnlockPhone] = useState(false);
  
  // Show/hide state for main form fields
  const [showMainPNName, setShowMainPNName] = useState(false);
  const [showMainPasscode, setShowMainPasscode] = useState(false);

  // Main screen form state
  const [unlockForm, setUnlockForm] = useState({
    pnName: '',
    passcode: '',
    nickname: '',
    email: '',
    phone: ''
  });

  // Main form state for identity unlock
  const [mainForm, setMainForm] = useState({
    pnName: '',
    passcode: '',
    uploadFile: null as File | null
  });

  // Recovery key form state
  const [recoveryKeyForm, setRecoveryKeyForm] = useState({
    purpose: 'personal' as 'personal' | 'business' | 'emergency',
    description: ''
  });

  // Identity selector state
  const [selectedStoredIdentity, setSelectedStoredIdentity] = useState<any>(null);
  const [showIdentitySelector, setShowIdentitySelector] = useState(false);

  // Onboarding wizard state
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  return {
    // Profile editing
    showProfilePictureEditor,
    setShowProfilePictureEditor,
    showNicknameEditor,
    setShowNicknameEditor,
    editingNickname,
    setEditingNickname,

    // Info sections
    showRecoveryInfo,
    setShowRecoveryInfo,
    showCustodianInfo,
    setShowCustodianInfo,

    // Custodian acceptance
    showCustodianAcceptanceModal,
    setShowCustodianAcceptanceModal,
    pendingCustodianInvitationData,
    setPendingCustodianInvitationData,
    custodianAcceptanceData,
    setCustodianAcceptanceData,

    // Biometric
    showBiometricModal,
    setShowBiometricModal,
    biometricAvailable,
    setBiometricAvailable,
    biometricEnabled,
    setBiometricEnabled,

    // Device info and invitations
    showDeviceInfoModal,
    setShowDeviceInfoModal,
    showUnlockFromUsbModal,
    setShowUnlockFromUsbModal,
    showUnlockFromNfcModal,
    setShowUnlockFromNfcModal,
    hasNfcSupport,
    showSendInvitationModal,
    setShowSendInvitationModal,
    selectedCustodianForInvitation,
    setSelectedCustodianForInvitation,

    // Forms
    createForm,
    setCreateForm,
    createStep,
    setCreateStep,
    showPNName,
    setShowPNName,
    showPasscode,
    setShowPasscode,
    showConfirmPNName,
    setShowConfirmPNName,
    showConfirmPasscode,
    setShowConfirmPasscode,
    showCreatePasscode,
    setShowCreatePasscode,
    showCreateConfirmPasscode,
    setShowCreateConfirmPasscode,
    showCreateNickname,
    setShowCreateNickname,
    showCreateEmail,
    setShowCreateEmail,
    showCreatePhone,
    setShowCreatePhone,

    // Unlock forms
    showUnlockPasscode,
    setShowUnlockPasscode,
    showUnlockNickname,
    setShowUnlockNickname,
    showUnlockEmail,
    setShowUnlockEmail,
    showUnlockPhone,
    setShowUnlockPhone,
    
    // Main form visibility
    showMainPNName,
    setShowMainPNName,
    showMainPasscode,
    setShowMainPasscode,
    unlockForm,
    setUnlockForm,
    mainForm,
    setMainForm,
    recoveryKeyForm,
    setRecoveryKeyForm,

    // Identity selector
    selectedStoredIdentity,
    setSelectedStoredIdentity,
    showIdentitySelector,
    setShowIdentitySelector,

    // Onboarding
    showOnboardingWizard,
    setShowOnboardingWizard,
    isNewUser,
    setIsNewUser
  };
}
