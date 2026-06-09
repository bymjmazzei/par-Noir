import { useState } from 'react';

export interface WebIdentityData {
  id: string;
  name: string;
  username: string;
  created: number;
}

export interface SyncedDevice {
  id: string;
  name: string;
  type: string;
  lastSync: number;
}

export interface RecoveryRequest {
  id: string;
  requestingUser: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
  claimantContactType?: 'email' | 'phone';
  claimantContactValue?: string;
  signatures: any[];
  approvals: any[];
}

export interface DIDInfo {
  id: string;
  name: string;
  username: string;
  created: number;
  lastUsed: number;
  isActive: boolean;
}

export function useMigrationState() {
  // Migration states
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [pendingMigrations, setPendingMigrations] = useState<WebIdentityData[]>([]);
  const [migrationChecked, setMigrationChecked] = useState(false);

  // Integration settings
  const [showIntegrationSettings, setShowIntegrationSettings] = useState(false);
  const [showIntegrationDebugger, setShowIntegrationDebugger] = useState(false);

  // Custodianships
  const [custodianships, setCustodianships] = useState<Array<{
    id: string;
    identityId: string;
    identityName: string;
    identityUsername: string;
    status: 'active' | 'pending';
    canApprove: boolean;
  }>>([]);

  // Recovery key input
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [activeRecoveryMethod, setActiveRecoveryMethod] = useState<'pn' | 'legacy'>('pn');
  const [recoveryKeyContactInfo, setRecoveryKeyContactInfo] = useState({
    contactType: 'email' as 'email' | 'phone',
    contactValue: '',
    claimantName: ''
  });

  // License management
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [licenseProof, setLicenseProof] = useState<any>(null);

  // Device management
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
  const [pendingCustodianInvitation, setPendingCustodianInvitation] = useState<any>(null);

  return {
    // Migration
    showMigrationModal,
    setShowMigrationModal,
    pendingMigrations,
    setPendingMigrations,
    migrationChecked,
    setMigrationChecked,

    // Integration
    showIntegrationSettings,
    setShowIntegrationSettings,
    showIntegrationDebugger,
    setShowIntegrationDebugger,

    // Custodianships
    custodianships,
    setCustodianships,

    // Recovery key
    recoveryKeyInput,
    setRecoveryKeyInput,
    activeRecoveryMethod,
    setActiveRecoveryMethod,
    recoveryKeyContactInfo,
    setRecoveryKeyContactInfo,

    // License
    licenseKey,
    setLicenseKey,
    licenseInfo,
    setLicenseInfo,
    licenseProof,
    setLicenseProof,

    // Device
    currentDevice,
    setCurrentDevice,

    // Recovery completion
    showRecoveryCompleteModal,
    setShowRecoveryCompleteModal,
    recoveredDID,
    setRecoveredDID,

    // Custodian approval
    showCustodianApprovalModal,
    setShowCustodianApprovalModal,
    selectedRecoveryRequest,
    setSelectedRecoveryRequest,
    selectedCustodianship,
    setSelectedCustodianship,

    // Custodian invitation
    showCustodianInvitationModal,
    setShowCustodianInvitationModal,
    pendingCustodianInvitation,
    setPendingCustodianInvitation
  };
}
