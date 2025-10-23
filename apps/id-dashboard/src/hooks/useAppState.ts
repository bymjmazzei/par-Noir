import { useState, useRef, useEffect } from 'react';
import { SecureStorage } from '../utils/storage';
import usePWA from './usePWA';

export interface DIDInfo {
  id: string;
  name: string;
  username: string;
  created: number;
  lastUsed: number;
  isActive: boolean;
}

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
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Function to handle success messages with proper timeout management
  const showSuccessMessage = (message: string, duration: number = 3000) => {
    // Clear any existing timeout
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
    
    // Set the success message
    setSuccess(message);
    
    // Set new timeout with a unique identifier
    const timeoutId = setTimeout(() => {
      // Only clear if this is still our active timeout
      if (successTimeoutRef.current === timeoutId) {
        setSuccess(null);
        successTimeoutRef.current = null;
      }
    }, duration);
    
    successTimeoutRef.current = timeoutId;
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
  const showErrorMessage = (message: string, duration: number = 9000) => {
    setError(message);
    setTimeout(() => setError(null), duration);
  };

  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);

  // Navigation state
  const [activeTab, setActiveTab] = useState<'privacy' | 'devices' | 'recovery' | 'developer' | 'delegation' | 'storage'>('privacy');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [globalSettingsExpanded, setGlobalSettingsExpanded] = useState(false);
  const [thirdPartyExpanded, setThirdPartyExpanded] = useState(false);

  // Data points state
  const [attestedDataPoints, setAttestedDataPoints] = useState<Set<string>>(new Set());
  const [verifiedDataPoints, setVerifiedDataPoints] = useState<Set<string>>(new Set());
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // PWA functionality
  const [pwaState, pwaHandlers] = usePWA();
  const [isPWALocked, setIsPWALocked] = useState(false);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Debug PWA lock state
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logDebug('PWA Lock State:', isPWALocked);
    }
  }, [isPWALocked]);

  // Log PWA state for debugging (only in development)
  if (process.env.NODE_ENV === 'development') {
    logDebug('PWA State:', pwaState);
  }

  return {
    // Core state
    storage,
    dids,
    setDids,
    loading,
    setLoading,
    error,
    setError,
    success,
    setSuccess: setSuccessWithTimeout,
    
    // Message handlers
    showSuccessMessage,
    showErrorMessage,
    
    // Form state
    showCreateForm,
    setShowCreateForm,
    showImportForm,
    setShowImportForm,
    selectedDID,
    setSelectedDID,
    
    // Navigation state
    activeTab,
    setActiveTab,
    isDemoMode,
    setIsDemoMode,
    globalSettingsExpanded,
    setGlobalSettingsExpanded,
    thirdPartyExpanded,
    setThirdPartyExpanded,
    
    // Data points state
    attestedDataPoints,
    setAttestedDataPoints,
    verifiedDataPoints,
    setVerifiedDataPoints,
    showVerificationModal,
    setShowVerificationModal,
    
    // PWA state
    pwaState,
    pwaHandlers,
    isPWALocked,
    setIsPWALocked
  };
}
