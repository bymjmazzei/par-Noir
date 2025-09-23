import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DIDInfo, AuthSession, RecoveryRequest, RecoveryCustodian, SyncedDevice, ExportAuthData, TransferSetupData, RecoveryData, CustodianInvitationForm } from '../types/app';

export const useAppState = () => {
  // Core state
  const [storage] = useState(() => new (require('../utils/storage').SecureStorage)());
  const [dids, setDids] = useState<DIDInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);

  // Tab and settings state
  const [activeTab, setActiveTab] = useState<'privacy' | 'devices' | 'recovery' | 'storage' | 'developer'>('privacy');
  const [globalSettingsExpanded, setGlobalSettingsExpanded] = useState(false);
  const [thirdPartyExpanded, setThirdPartyExpanded] = useState(false);
  const [attestedDataPoints, setAttestedDataPoints] = useState<Set<string>>(new Set());

  // PWA state
  const [isPWALocked, setIsPWALocked] = useState(false);

  // Recovery and custodian state
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([]);
  const [custodians, setCustodians] = useState<RecoveryCustodian[]>([]);
  const [syncedDevices, setSyncedDevices] = useState<SyncedDevice[]>([]);

  // Export and transfer state
  const [showExportAuthModal, setShowExportAuthModal] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [exportAuthData, setExportAuthData] = useState<ExportAuthData>({ passcode: '', pnName: '' });
  const [showTransferSetupModal, setShowTransferSetupModal] = useState(false);
  const [transferPasscode, setTransferPasscode] = useState('');
  const [transferDeviceName, setTransferDeviceName] = useState('');

  // Recovery state
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryData, setRecoveryData] = useState<RecoveryData>({ pnName: '', nickname: '', emailOrPhone: '', passcode: '' });
  const [recoveryThreshold, setRecoveryThreshold] = useState(2);

  // Custodian invitation state
  const [showCustodianModal, setShowCustodianModal] = useState(false);
  const [custodianForm, setCustodianForm] = useState<CustodianInvitationForm>({ name: '', contactType: 'email', contactValue: '', type: 'person', passcode: '' });
  const [custodianQRCode, setCustodianQRCode] = useState<string>('');
  const [custodianContactInfo, setCustodianContactInfo] = useState<CustodianInvitationForm | null>(null);

  // Success message management
  const showSuccessMessage = useCallback((message: string, duration: number = 3000) => {
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    
    setSuccess(message);
    
    const timeoutId = setTimeout(() => {
      if (successTimeoutRef.current === timeoutId) {
        setSuccess(null);
        successTimeoutRef.current = null;
      }
    }, duration);
    
    successTimeoutRef.current = timeoutId;
  }, []);

  const setSuccessWithTimeout = useCallback((message: string | null) => {
    if (message === null) {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      setSuccess(null);
    } else {
      showSuccessMessage(message);
    }
  }, [showSuccessMessage]);

  // Error message management
  const showErrorMessage = useCallback((message: string, duration: number = 5000) => {
    setError(message);
    setTimeout(() => setError(null), duration);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    storage,
    dids,
    setDids,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess: setSuccessWithTimeout,
    showCreateForm,
    setShowCreateForm,
    showImportForm,
    setShowImportForm,
    selectedDID,
    setSelectedDID,
    activeTab,
    setActiveTab,
    globalSettingsExpanded,
    setGlobalSettingsExpanded,
    thirdPartyExpanded,
    setThirdPartyExpanded,
    attestedDataPoints,
    setAttestedDataPoints,
    isPWALocked,
    setIsPWALocked,
    recoveryRequests,
    setRecoveryRequests,
    custodians,
    setCustodians,
    syncedDevices,
    setSyncedDevices,
    showExportAuthModal,
    setShowExportAuthModal,
    showExportOptionsModal,
    setShowExportOptionsModal,
    exportAuthData,
    setExportAuthData,
    showTransferSetupModal,
    setShowTransferSetupModal,
    transferPasscode,
    setTransferPasscode,
    transferDeviceName,
    setTransferDeviceName,
    showRecoveryModal,
    setShowRecoveryModal,
    recoveryData,
    setRecoveryData,
    recoveryThreshold,
    setRecoveryThreshold,
    showCustodianModal,
    setShowCustodianModal,
    custodianForm,
    setCustodianForm,
    custodianQRCode,
    setCustodianQRCode,
    custodianContactInfo,
    setCustodianContactInfo,

    // Actions
    showSuccessMessage,
    showErrorMessage,
  };
};
