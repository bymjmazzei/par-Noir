import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle, Smartphone, RefreshCw, FileText, PartyPopper, QrCode, MessageSquare, Phone, AlertTriangle, Info, Monitor, Edit3, Settings, ChevronUp, ChevronDown, Users } from 'lucide-react';
import { DIDInfo, RecoveryCustodian, RecoveryRequest, RecoveryKey, SyncedDevice } from '../types/dashboard';
import { SecureStorage } from "../../utils/storage";
import { logger } from "../../utils/logger";
import { useCleanupManager } from "../../utils/cleanupManager";
import { ThemeSwitcher } from '../ThemeSwitcher';
import { DelegationModal } from '../DelegationModal';

interface MainDashboardProps {
  dids: DIDInfo[];
  selectedDID: DIDInfo | null;
  onDIDSelect: (did: DIDInfo) => void;
  onDIDCreate: (did: DIDInfo) => void;
  onDIDUpdate: (did: DIDInfo) => void;
  onDIDDelete: (didId: string) => void;
}

export const MainDashboard: React.FC<MainDashboardProps> = ({
  dids,
  selectedDID,
  onDIDSelect,
  onDIDCreate,
  onDIDUpdate,
  onDIDDelete
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'devices' | 'recovery' | 'developer' | 'delegation'>('privacy');
  const [globalSettingsExpanded, setGlobalSettingsExpanded] = useState(false);
  const [thirdPartyExpanded, setThirdPartyExpanded] = useState(false);
  const [attestedDataPoints, setAttestedDataPoints] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isDelegationModalOpen, setIsDelegationModalOpen] = useState(false);

  const cleanupManager = useCleanupManager();

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  // Function to handle success messages with proper timeout management
  const showSuccessMessage = useCallback((message: string, duration: number = 3000) => {
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
    
    // Add cleanup
    cleanupManager.addTimer(timeoutId);
  }, [cleanupManager]);

  // Function to handle error messages with proper timeout management
  const showErrorMessage = useCallback((message: string, duration: number = 5000) => {
    setError(message);
    const timeoutId = setTimeout(() => setError(null), duration);
    cleanupManager.addTimer(timeoutId);
  }, [cleanupManager]);

  const handleTabChange = useCallback((tab: 'privacy' | 'devices' | 'recovery' | 'developer') => {
    setActiveTab(tab);
  }, []);

  const handleGlobalSettingsToggle = useCallback(() => {
    setGlobalSettingsExpanded(prev => !prev);
  }, []);

  const handleThirdPartyToggle = useCallback(() => {
    setThirdPartyExpanded(prev => !prev);
  }, []);

  const handleDataPointAttestation = useCallback((dataPoint: string) => {
    setAttestedDataPoints(prev => new Set([...prev, dataPoint]));
    showSuccessMessage(`Data point "${dataPoint}" attested successfully`);
  }, [showSuccessMessage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Theme Switcher - Initialize dark theme */}
      <ThemeSwitcher />
      
      {/* Header Section */}
      <div className="bg-bg-primary shadow-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-theme-primary">par Noir Dashboard</h1>
            <div className="flex items-center space-x-4">
              <ThemeSwitcher />
              <button
                onClick={() => onDIDCreate({} as DIDInfo)}
                className="modal-button"
              >
                Create New ID
              </button>
              <button
                onClick={() => {/* Import logic */}}
                className="modal-button"
              >
                Import ID
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-modal-bg rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 text-theme-primary">Your Identities</h2>
              <div className="space-y-2">
                {dids.map((did) => (
                  <button
                    key={did.id}
                    onClick={() => onDIDSelect(did)}
                    className={`w-full text-left p-3 rounded-md transition-colors ${
                      selectedDID?.id === did.id
                        ? 'bg-hover border border-border'
                        : 'hover:bg-hover'
                    }`}
                  >
                    <div className="font-medium text-theme-primary">{did.pnName || did.displayName}</div>
                    <div className="text-sm text-theme-secondary">{did.id}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            {/* Tab Navigation */}
            <div className="bg-modal-bg rounded-lg shadow mb-6">
              <div className="border-b border-border">
                <nav className="flex space-x-8 px-6">
                  {[
                    { id: 'privacy', label: 'Privacy', icon: Settings },
                    { id: 'devices', label: 'Devices', icon: Smartphone },
                    { id: 'recovery', label: 'Recovery', icon: RefreshCw },
                    { id: 'developer', label: 'Developer', icon: Monitor },
                    { id: 'delegation', label: 'Delegation', icon: Users }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id as any)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                          activeTab === tab.id
                            ? 'border-primary text-primary'
                            : 'border-transparent text-theme-secondary hover:text-theme-primary hover:border-border'
                        }`}
                      >
                        <Icon className="w-5 h-5 inline mr-2" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            <div className="bg-modal-bg rounded-lg shadow p-6">
              {activeTab === 'privacy' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-theme-primary">Privacy Controls</h3>
                  <div className="space-y-4">
                    <div className="bg-modal-bg border border-border rounded-lg p-4">
                      <h4 className="font-medium text-theme-primary mb-2">Data Sharing Preferences</h4>
                      <div className="space-y-2">
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          <span className="text-theme-secondary">Allow third-party data sharing</span>
                        </label>
                        <label className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          <span className="text-theme-secondary">Enable analytics tracking</span>
                        </label>
                      </div>
                    </div>
                    <div className="bg-modal-bg border border-border rounded-lg p-4">
                      <h4 className="font-medium text-theme-primary mb-2">Identity Verification</h4>
                      <p className="text-theme-secondary mb-3">Manage how your identity is verified and shared.</p>
                      <button className="modal-button">Configure Verification Settings</button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'devices' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-theme-primary">Device Management</h3>
                  <p className="text-theme-secondary">Device synchronization and management options will be displayed here.</p>
                </div>
              )}

              {activeTab === 'recovery' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-theme-primary">Recovery Options</h3>
                  <p className="text-theme-secondary">Recovery and backup options will be displayed here.</p>
                </div>
              )}

              {activeTab === 'developer' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-theme-primary">Developer Tools</h3>
                  <p className="text-theme-secondary">Developer tools and API access will be displayed here.</p>
                </div>
              )}

              {activeTab === 'delegation' && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-theme-primary">Delegation Management</h3>
                  <p className="text-theme-secondary mb-6">Manage delegations and permissions for your pN identities. Delegate specific capabilities to other pNs while maintaining control.</p>
                  
                  <div className="space-y-6">
                    <div className="bg-modal-bg border border-border rounded-lg p-4">
                      <h4 className="font-medium text-theme-primary mb-3">Create New Delegation</h4>
                      <p className="text-theme-secondary mb-4">Grant specific permissions to another pN identity for limited access to your data or capabilities.</p>
                      <button 
                        onClick={() => setIsDelegationModalOpen(true)}
                        className="modal-button"
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Create Delegation
                      </button>
                    </div>
                    
                    <div className="bg-modal-bg border border-border rounded-lg p-4">
                      <h4 className="font-medium text-theme-primary mb-3">Active Delegations</h4>
                      <div className="space-y-3">
                        <div className="text-center py-8 text-theme-secondary">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>No active delegations</p>
                          <p className="text-sm">Create your first delegation to get started</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-modal-bg border border-border rounded-lg p-4">
                      <h4 className="font-medium text-theme-primary mb-3">Delegation Capabilities</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <h5 className="font-medium text-theme-primary">Identity Verification</h5>
                          <p className="text-sm text-theme-secondary">Delegate identity verification to trusted pNs</p>
                        </div>
                        <div className="space-y-2">
                          <h5 className="font-medium text-theme-primary">Data Access</h5>
                          <p className="text-sm text-theme-secondary">Grant limited access to specific data points</p>
                        </div>
                        <div className="space-y-2">
                          <h5 className="font-medium text-theme-primary">Transaction Signing</h5>
                          <p className="text-sm text-theme-secondary">Delegate transaction approval capabilities</p>
                        </div>
                        <div className="space-y-2">
                          <h5 className="font-medium text-theme-primary">Recovery Access</h5>
                          <p className="text-sm text-theme-secondary">Enable recovery through delegated pNs</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
          {success}
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Delegation Modal */}
      <DelegationModal
        isOpen={isDelegationModalOpen}
        onClose={() => setIsDelegationModalOpen(false)}
        onDelegationCreated={(delegation) => {
          // Delegation created successfully
          showSuccessMessage('Delegation created successfully!');
        }}
      />
    </div>
  );
};
