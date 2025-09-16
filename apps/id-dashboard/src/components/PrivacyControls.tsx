import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Eye, EyeOff, Shield, Lock, Unlock, Settings, Users, UserCheck, Globe, Smartphone, CheckCircle } from 'lucide-react';
import { GlobalPrivacySettings } from '../types/privacy';
import { IdentityVerificationModal } from './IdentityVerificationModal';
import { VerifiedIdentityData } from '../types/verifiedIdentity';
import { verifiedIdentityManager } from '../services/verifiedIdentityManager';

interface PrivacyControlsProps {
  identityId?: string;
  onPrivacyUpdate?: (settings: GlobalPrivacySettings) => void;
  onDataAccessRequest?: (request: any) => void;
}

export const PrivacyControls: React.FC<PrivacyControlsProps> = React.memo(({
  identityId,
  onPrivacyUpdate,
  onDataAccessRequest
}) => {
  const [privacySettings, setPrivacySettings] = useState<GlobalPrivacySettings>({
    dataSharing: 'selective',
    analytics: false,
    thirdPartyAccess: false,
    locationSharing: false,
    biometricData: false,
    crossPlatformSync: false,
    dataRetention: 'minimal',
    auditLogging: true,
    transparency: 'high'
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dataAccessRequests, setDataAccessRequests] = useState<any[]>([]);
  const [activeConnections, setActiveConnections] = useState<any[]>([]);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{
    isVerified: boolean;
    verificationLevel: 'basic' | 'enhanced' | 'verified' | null;
    verifiedAt: string | null;
    dataPoints: string[];
  }>({
    isVerified: false,
    verificationLevel: null,
    verifiedAt: null,
    dataPoints: []
  });

  // Load privacy settings
  const loadPrivacySettings = useCallback(async () => {
    try {
      // In real implementation, this would fetch from storage/backend
      // For now, using default settings
      // Loading privacy settings
    } catch (error) {
              // Failed to load privacy settings
    }
  }, []);

  // Update privacy setting
  const updatePrivacySetting = useCallback((key: keyof GlobalPrivacySettings, value: any) => {
    setPrivacySettings(prev => {
      const updated = { ...prev, [key]: value };
      
      // Notify parent component
      if (onPrivacyUpdate) {
        onPrivacyUpdate(updated);
      }
      
      return updated;
    });
  }, [onPrivacyUpdate]);

  // Handle data access request
  const handleDataAccessRequest = useCallback((request: any, approved: boolean) => {
    if (approved) {
      // Grant access
      setDataAccessRequests(prev => prev.filter(r => r.id !== request.id));
      setActiveConnections(prev => [...prev, { ...request, grantedAt: new Date().toISOString() }]);
    } else {
      // Deny access
      setDataAccessRequests(prev => prev.filter(r => r.id !== request.id));
    }
    
    // Notify parent component
    if (onDataAccessRequest) {
      onDataAccessRequest({ ...request, approved });
    }
  }, [onDataAccessRequest]);

  // Revoke connection
  const revokeConnection = useCallback((connectionId: string) => {
    setActiveConnections(prev => prev.filter(c => c.id !== connectionId));
  }, []);

  // Load verification status
  const loadVerificationStatus = useCallback(async () => {
    if (!identityId) return;
    
    try {
      const status = await verifiedIdentityManager.getVerificationStatus(identityId);
      setVerificationStatus(status);
    } catch (error) {
      console.error('Failed to load verification status:', error);
    }
  }, [identityId]);

  // Handle verification completion
  const handleVerificationComplete = useCallback(async (verifiedData: VerifiedIdentityData) => {
    try {
      // Reload verification status
      await loadVerificationStatus();
      setShowVerificationModal(false);
      
      // Show success message
      console.log('Identity verification completed successfully:', verifiedData);
    } catch (error) {
      console.error('Failed to handle verification completion:', error);
    }
  }, [loadVerificationStatus]);

  // Load initial data
  useEffect(() => {
    loadPrivacySettings();
    loadVerificationStatus();
    
    // Simulate some data access requests
    setDataAccessRequests([
      {
        id: '1',
        requester: 'Weather App',
        requestedData: ['location', 'device_info'],
        purpose: 'Provide local weather information',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      },
      {
        id: '2',
        requester: 'Social Media Platform',
        requestedData: ['profile', 'contacts'],
        purpose: 'Connect with friends and family',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
      }
    ]);
    
    // Simulate active connections
    setActiveConnections([
      {
        id: '1',
        name: 'Banking App',
        grantedData: ['identity', 'verification'],
        grantedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        lastUsed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }
    ]);
  }, [loadPrivacySettings, loadVerificationStatus]);

  // Memoized privacy score
  const privacyScore = useMemo(() => {
    let score = 100;
    
    // Deduct points for permissive settings
    if (privacySettings.dataSharing === 'public') score -= 30;
    else if (privacySettings.dataSharing === 'selective') score -= 15;
    
    if (privacySettings.analytics) score -= 10;
    if (privacySettings.thirdPartyAccess) score -= 20;
    if (privacySettings.locationSharing) score -= 15;
    if (privacySettings.biometricData) score -= 10;
    if (privacySettings.crossPlatformSync) score -= 10;
    
    if (privacySettings.dataRetention === 'extended') score -= 20;
    else if (privacySettings.dataRetention === 'standard') score -= 10;
    
    return Math.max(0, score);
  }, [privacySettings]);

  // Memoized privacy level
  const privacyLevel = useMemo(() => {
    if (privacyScore >= 90) return { level: 'excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (privacyScore >= 75) return { level: 'good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (privacyScore >= 50) return { level: 'fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { level: 'poor', color: 'text-red-600', bg: 'bg-red-100' };
  }, [privacyScore]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-purple-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Privacy Controls
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Control how your data is shared and accessed
            </p>
          </div>
        </div>
        
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <Settings className="w-4 h-4 mr-2" />
          {showAdvanced ? 'Hide Advanced' : 'Advanced Settings'}
        </button>
      </div>

      {/* Privacy Score */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Privacy Score
            </h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${privacyLevel.bg} ${privacyLevel.color}`}>
              {privacyLevel.level.toUpperCase()}
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {privacyScore}/100
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                privacyScore >= 90 ? 'bg-green-500' :
                privacyScore >= 75 ? 'bg-blue-500' :
                privacyScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${privacyScore}%` }}
            ></div>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Identity Verification
          </h3>
          <div className="flex items-center justify-between mb-2">
            <div className={`text-2xl font-bold ${
              verificationStatus.isVerified ? 'text-green-600' : 'text-gray-400'
            }`}>
              {verificationStatus.isVerified ? 'VERIFIED' : 'NOT VERIFIED'}
            </div>
            {verificationStatus.isVerified && (
              <CheckCircle className="w-6 h-6 text-green-600" />
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {verificationStatus.isVerified 
              ? `${verificationStatus.dataPoints.length} data points verified`
              : 'Verify your identity to unlock verified data points'
            }
          </p>
          <button
            onClick={() => setShowVerificationModal(true)}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              verificationStatus.isVerified
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {verificationStatus.isVerified ? 'VIEW VERIFICATION' : 'VERIFY'}
          </button>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Active Connections
          </h3>
          <div className="text-3xl font-bold text-blue-600 mb-2">
            {activeConnections.length}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {activeConnections.length === 0 
              ? 'No active connections' 
              : 'Apps with data access'
            }
          </p>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Pending Requests
          </h3>
          <div className="text-3xl font-bold text-orange-600 mb-2">
            {dataAccessRequests.length}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {dataAccessRequests.length === 0 
              ? 'No pending requests' 
              : 'Awaiting your approval'
            }
          </p>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Data Sharing
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Sharing Level
              </label>
              <select
                value={privacySettings.dataSharing}
                onChange={(e) => updatePrivacySetting('dataSharing', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="private">Private - No sharing</option>
                <option value="selective">Selective - Choose what to share</option>
                <option value="public">Public - Share with everyone</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Data Retention
              </label>
              <select
                value={privacySettings.dataRetention}
                onChange={(e) => updatePrivacySetting('dataRetention', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="minimal">Minimal - Delete quickly</option>
                <option value="standard">Standard - Keep for reasonable time</option>
                <option value="extended">Extended - Keep for longer</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Transparency Level
              </label>
              <select
                value={privacySettings.transparency}
                onChange={(e) => updatePrivacySetting('transparency', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="low">Low - Basic information</option>
                <option value="medium">Medium - Detailed information</option>
                <option value="high">High - Full transparency</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Feature Controls
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Globe className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Analytics & Tracking</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('analytics', !privacySettings.analytics)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.analytics ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.analytics ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Third-Party Access</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('thirdPartyAccess', !privacySettings.thirdPartyAccess)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.thirdPartyAccess ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.thirdPartyAccess ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Smartphone className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Location Sharing</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('locationSharing', !privacySettings.locationSharing)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.locationSharing ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.locationSharing ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <UserCheck className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Biometric Data</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('biometricData', !privacySettings.biometricData)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.biometricData ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.biometricData ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Access Requests */}
      {dataAccessRequests.length > 0 && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Pending Data Access Requests
          </h3>
          <div className="space-y-4">
            {dataAccessRequests.map((request) => (
              <div key={request.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      {request.requester}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {request.purpose}
                    </p>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Requested: {request.requestedData.join(', ')}</span>
                      <span>•</span>
                      <span>{new Date(request.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleDataAccessRequest(request, true)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDataAccessRequest(request, false)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Connections */}
      {activeConnections.length > 0 && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Active Data Connections
          </h3>
          <div className="space-y-4">
            {activeConnections.map((connection) => (
              <div key={connection.id} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      {connection.name}
                    </h4>
                    <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                      <span>Access to: {connection.grantedData.join(', ')}</span>
                      <span>•</span>
                      <span>Granted: {new Date(connection.grantedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>Last used: {new Date(connection.lastUsed).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => revokeConnection(connection.id)}
                    className="px-3 py-1 text-red-600 hover:text-red-700 transition-colors text-sm"
                  >
                    Revoke Access
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Advanced Settings */}
      {showAdvanced && (
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Advanced Privacy Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Lock className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Cross-Platform Sync</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('crossPlatformSync', !privacySettings.crossPlatformSync)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.crossPlatformSync ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.crossPlatformSync ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Eye className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300">Audit Logging</span>
              </div>
              <button
                onClick={() => updatePrivacySetting('auditLogging', !privacySettings.auditLogging)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  privacySettings.auditLogging ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  privacySettings.auditLogging ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Identity Verification Modal */}
      <IdentityVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerificationComplete={handleVerificationComplete}
        identityId={identityId}
      />
    </div>
  );
});

PrivacyControls.displayName = 'PrivacyControls';
