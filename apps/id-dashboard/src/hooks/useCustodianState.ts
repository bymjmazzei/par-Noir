import { useState } from 'react';

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
  const [showSendInvitationModal, setShowSendInvitationModal] = useState(false);
  const [selectedCustodianForInvitation, setSelectedCustodianForInvitation] = useState<any>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    pnName: '',
    passcode: '',
    confirmPasscode: '',
    nickname: '',
    email: '',
    phone: ''
  });

  // Show/hide state for create form fields
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

  // Main screen form state
  const [unlockForm, setUnlockForm] = useState({
    pnName: '',
    passcode: '',
    nickname: '',
    email: '',
    phone: ''
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

    // Invitations
    showSendInvitationModal,
    setShowSendInvitationModal,
    selectedCustodianForInvitation,
    setSelectedCustodianForInvitation,

    // Forms
    createForm,
    setCreateForm,
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
    unlockForm,
    setUnlockForm,

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
