import { useState, useEffect } from 'react';

export function useCustodianState() {
  // Profile editing state
  const [showProfilePictureEditor, setShowProfilePictureEditor] = useState(false);
  const [showNicknameEditor, setShowNicknameEditor] = useState(false);
  const [editingNickname, setEditingNickname] = useState('');

  // Info section state
  const [showRecoveryInfo, setShowRecoveryInfo] = useState(false);

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

  // Recovery key form state
  const [recoveryKeyForm, setRecoveryKeyForm] = useState({
    purpose: 'personal' as 'personal' | 'legal' | 'insurance' | 'will',
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
