import React, { useState, useCallback, useEffect } from 'react';
import { GlobalPrivacySettings } from '../types/privacy';
import {
  PrivacyControlsHeader,
  PrivacyScoreCard,
  PrivacySettingsPanel,
  DataAccessRequests,
  ActiveConnections,
  AdvancedSettings,
  StatsCards
} from './privacy';

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
  const handleDataAccessRequest = useCallback((requestId: string, approved: boolean) => {
    const request = dataAccessRequests.find(r => r.id === requestId);
    if (!request) return;

    if (approved) {
      // Grant access
      setDataAccessRequests(prev => prev.filter(r => r.id !== requestId));
      setActiveConnections(prev => [...prev, { ...request, grantedAt: new Date().toISOString() }]);
    } else {
      // Deny access
      setDataAccessRequests(prev => prev.filter(r => r.id !== requestId));
    }
    
    // Notify parent component
    if (onDataAccessRequest) {
      onDataAccessRequest({ ...request, approved });
    }
  }, [dataAccessRequests, onDataAccessRequest]);

  // Revoke connection
  const revokeConnection = useCallback((connectionId: string) => {
    setActiveConnections(prev => prev.filter(c => c.id !== connectionId));
  }, []);

  // Load initial data
  useEffect(() => {
    loadPrivacySettings();
    
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
  }, [loadPrivacySettings]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PrivacyControlsHeader 
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
      />

      {/* Privacy Score and Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PrivacyScoreCard privacySettings={privacySettings} />
        <StatsCards 
          activeConnectionsCount={activeConnections.length}
          pendingRequestsCount={dataAccessRequests.length}
        />
      </div>

      {/* Privacy Settings */}
      <PrivacySettingsPanel 
        privacySettings={privacySettings}
        onSettingUpdate={updatePrivacySetting}
      />

      {/* Data Access Requests */}
      <DataAccessRequests 
        requests={dataAccessRequests}
        onRequestResponse={handleDataAccessRequest}
      />

      {/* Active Connections */}
      <ActiveConnections 
        connections={activeConnections}
        onRevokeConnection={revokeConnection}
      />

      {/* Advanced Settings */}
      {showAdvanced && (
        <AdvancedSettings 
          privacySettings={privacySettings}
          onSettingUpdate={updatePrivacySetting}
        />
      )}
    </div>
  );
});

PrivacyControls.displayName = 'PrivacyControls';
