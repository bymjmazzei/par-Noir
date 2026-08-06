import { useState, useRef, useEffect } from 'react';
import { SecureStorage } from '../utils/storage';
import usePWA from './usePWA';
import type { DIDInfo } from '../types/app';

export type { DIDInfo };

export interface ImportFormState {
  backupFile: File | null;
  pnName: string;
  passcode: string;
}

const EMPTY_IMPORT_FORM: ImportFormState = {
  backupFile: null,
  pnName: '',
  passcode: ''
};

// Production-safe logging utility
const logDebug = (_message: string, ..._args: unknown[]) => {
  // Only log in development
};

export function useAppState() {
  // Core storage and data
  const [storage] = useState(() => new SecureStorage());
  const [dids, setDids] = useState<DIDInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Function to handle success messages with proper timeout management
  const showSuccessMessage = (message: string, duration: number = 3000) => {
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
  };

  const setSuccessWithTimeout = (message: string | null) => {
    if (message === null) {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = null;
      }
      setSuccess(null);
    } else {
      showSuccessMessage(message);
    }
  };

  const showErrorMessage = (message: string, duration: number = 9000) => {
    setError(message);
    setTimeout(() => setError(null), duration);
  };

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importForm, setImportForm] = useState<ImportFormState>(EMPTY_IMPORT_FORM);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);

  // Navigation state
  const [activeTab, setActiveTab] = useState<
    'privacy' | 'devices' | 'recovery' | 'developer' | 'delegation' | 'storage' | 'subpn' | 'monetization'
  >('privacy');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [globalSettingsExpanded, setGlobalSettingsExpanded] = useState(false);
  const [thirdPartyExpanded, setThirdPartyExpanded] = useState(false);

  // Data points state
  const [attestedDataPoints, setAttestedDataPoints] = useState<Set<string>>(new Set());
  /** pending/loading: do not treat empty set as "no ZKPs yet" (avoids Add flash). */
  const [attestedHydrationStatus, setAttestedHydrationStatus] = useState<
    'pending' | 'loading' | 'ready'
  >('pending');
  const [verifiedDataPoints, setVerifiedDataPoints] = useState<Set<string>>(new Set());
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // PWA functionality
  const [pwaState, pwaHandlers] = usePWA();
  const [isPWALocked, setIsPWALocked] = useState(false);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logDebug('PWA Lock State:', isPWALocked);
    }
  }, [isPWALocked]);

  if (process.env.NODE_ENV === 'development') {
    logDebug('PWA State:', pwaState);
  }

  return {
    storage,
    dids,
    setDids,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess: setSuccessWithTimeout,
    successTimeoutRef,

    showSuccessMessage,
    showErrorMessage,

    showCreateForm,
    setShowCreateForm,
    showImportForm,
    setShowImportForm,
    importForm,
    setImportForm,
    selectedDID,
    setSelectedDID,

    activeTab,
    setActiveTab,
    isDemoMode,
    setIsDemoMode,
    globalSettingsExpanded,
    setGlobalSettingsExpanded,
    thirdPartyExpanded,
    setThirdPartyExpanded,

    attestedDataPoints,
    setAttestedDataPoints,
    attestedHydrationStatus,
    setAttestedHydrationStatus,
    verifiedDataPoints,
    setVerifiedDataPoints,
    showVerificationModal,
    setShowVerificationModal,

    pwaState,
    pwaHandlers,
    isPWALocked,
    setIsPWALocked
  };
}
