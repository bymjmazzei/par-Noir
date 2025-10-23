import { useState, useEffect } from 'react';

export interface RecoveryCustodian {
  id: string;
  name: string;
  contactType: 'email' | 'phone';
  contactValue: string;
  type: 'person' | 'service' | 'self';
  status: 'active' | 'pending' | 'revoked';
  createdAt: number;
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

export interface RecoveryKey {
  id: string;
  purpose: string;
  description: string;
  createdAt: number;
  isActive: boolean;
}

export function useIdentityState() {
  // Authentication state
  const [authenticatedUser, setAuthenticatedUser] = useState<any>(null);

  // Recovery system state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [showAddCustodianModal, setShowAddCustodianModal] = useState(false);
  const [showDataPointInputModal, setShowDataPointInputModal] = useState(false);
  const [currentDataPoint, setCurrentDataPoint] = useState<any>(null);
  const [currentDataPointExistingData, setCurrentDataPointExistingData] = useState<any>(null);
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [custodianQRCode, setCustodianQRCode] = useState<string>('');
  const [custodianContactInfo, setCustodianContactInfo] = useState({
    name: '',
    contactType: 'email' as 'email' | 'phone',
    contactValue: '',
    type: 'person' as 'person' | 'service' | 'self',
    passcode: ''
  });
  const [showRecoveryKeyInputModal, setShowRecoveryKeyInputModal] = useState(false);
  const [recoveryThreshold, setRecoveryThreshold] = useState(2);
  const [custodians, setCustodians] = useState<RecoveryCustodian[]>([]);
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([]);
  const [recoveryKeys, setRecoveryKeys] = useState<RecoveryKey[]>([]);

  return {
    // Authentication
    authenticatedUser,
    setAuthenticatedUser,

    // Recovery modals
    showRecoveryModal,
    setShowRecoveryModal,
    showAddCustodianModal,
    setShowAddCustodianModal,
    showDataPointInputModal,
    setShowDataPointInputModal,
    currentDataPoint,
    setCurrentDataPoint,
    currentDataPointExistingData,
    setCurrentDataPointExistingData,
    showRecoveryKeyModal,
    setShowRecoveryKeyModal,
    showRecoveryKeyInputModal,
    setShowRecoveryKeyInputModal,

    // Recovery data
    custodianQRCode,
    setCustodianQRCode,
    custodianContactInfo,
    setCustodianContactInfo,
    recoveryThreshold,
    setRecoveryThreshold,
    custodians,
    setCustodians,
    recoveryRequests,
    setRecoveryRequests,
    recoveryKeys,
    setRecoveryKeys
  };
}
