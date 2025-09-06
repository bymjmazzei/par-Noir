import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { security } from '../utils/security';
import { cryptoWorkerManager } from '../utils/crypto/cryptoWorkerManager';
import {
  SecurityHeader,
  SecurityScoreCard,
  SecuritySettingsPanel,
  ThreatHistoryPanel
} from './security';

interface SecurityStatus {
  deviceSecurity: boolean;
  webAuthnSupported: boolean;
  supplyChainSecurity: boolean;
  threats: any[];
  vulnerabilities: any[];
  lastCheck: string;
}

interface SecurityPanelProps {
  identityId?: string;
  onSecurityEvent?: (event: any) => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = React.memo(({
  identityId,
  onSecurityEvent
}) => {
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [threatHistory, setThreatHistory] = useState<any[]>([]);
  const [securitySettings, setSecuritySettings] = useState({
    autoLock: true,
    biometricRequired: false,
    sessionTimeout: 30,
    threatNotifications: true
  });

  // Fetch security status
  const checkSecurityStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      // Simulate security check - in real implementation this would call the security service
      const status: SecurityStatus = {
        deviceSecurity: true,
        webAuthnSupported: true,
        supplyChainSecurity: true,
        threats: [],
        vulnerabilities: [],
        lastCheck: new Date().toISOString()
      };
      
      setSecurityStatus(status);
      
      // Check crypto worker health
      const workerHealthy = cryptoWorkerManager.isHealthy();
      if (!workerHealthy) {
        status.threats.push({
          type: 'crypto_worker_unhealthy',
          severity: 'medium',
          description: 'Cryptographic operations may be slower than expected'
        });
      }
      
    } catch (error) {
      // Error handling for production
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Load threat history
  const loadThreatHistory = useCallback(async () => {
    try {
      // In real implementation, this would fetch from security service
      const history = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          type: 'failed_login_attempt',
          severity: 'low',
          description: 'Multiple failed login attempts detected',
          resolved: true
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          type: 'suspicious_ip',
          severity: 'medium',
          description: 'Login attempt from unusual IP address',
          resolved: true
        }
      ];
      setThreatHistory(history);
    } catch (error) {
      // Error handling for production
    }
  }, []);

  // Update security settings
  const updateSecuritySetting = useCallback((key: string, value: any) => {
    setSecuritySettings(prev => ({
      ...prev,
      [key]: value
    }));
    
    // In real implementation, this would save to backend
  }, []);

  // Handle security event
  const handleSecurityEvent = useCallback((event: any) => {
    if (onSecurityEvent) {
      onSecurityEvent(event);
    }
    
    // Update local state
    if (securityStatus) {
      setSecurityStatus(prev => prev ? {
        ...prev,
        threats: [...prev.threats, event],
        lastCheck: new Date().toISOString()
      } : null);
    }
  }, [onSecurityEvent, securityStatus]);

  // Initial load
  useEffect(() => {
    checkSecurityStatus();
    loadThreatHistory();
  }, [checkSecurityStatus, loadThreatHistory]);

  if (!securityStatus) {
    return (
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <SecurityHeader 
        lastCheck={securityStatus.lastCheck}
        isChecking={isChecking}
        onCheckSecurity={checkSecurityStatus}
      />

      {/* Security Score */}
      <SecurityScoreCard 
        threats={securityStatus.threats}
        vulnerabilities={securityStatus.vulnerabilities}
      />

      {/* Security Settings */}
      <SecuritySettingsPanel 
        settings={securitySettings}
        onSettingUpdate={updateSecuritySetting}
      />

      {/* Threat History */}
      <ThreatHistoryPanel threats={threatHistory} />
    </div>
  );
});

SecurityPanel.displayName = 'SecurityPanel';
