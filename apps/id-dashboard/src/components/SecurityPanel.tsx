import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle, Lock, Eye, EyeOff, Settings, RefreshCw } from 'lucide-react';
import { security } from '../utils/security';
import { cryptoWorkerManager } from '../utils/cryptoWorkerManager';

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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      // Console statement removed for production
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
      // Console statement removed for production
    }
  }, []);

  // Update security settings
  const updateSecuritySetting = useCallback((key: string, value: any) => {
    setSecuritySettings(prev => ({
      ...prev,
      [key]: value
    }));
    
    // In real implementation, this would save to backend
    // Console statement removed for production
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

  // Memoized security score
  const securityScore = useMemo(() => {
    if (!securityStatus) return 0;
    
    let score = 100;
    
    // Deduct points for threats
    score -= securityStatus.threats.filter(t => t.severity === 'high').length * 20;
    score -= securityStatus.threats.filter(t => t.severity === 'medium').length * 10;
    score -= securityStatus.threats.filter(t => t.severity === 'low').length * 5;
    
    // Deduct points for vulnerabilities
    score -= securityStatus.vulnerabilities.length * 15;
    
    return Math.max(0, score);
  }, [securityStatus]);

  // Memoized security level
  const securityLevel = useMemo(() => {
    if (securityScore >= 90) return { level: 'excellent', color: 'text-green-600', bg: 'bg-green-100' };
    if (securityScore >= 75) return { level: 'good', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (securityScore >= 50) return { level: 'fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { level: 'poor', color: 'text-red-600', bg: 'bg-red-100' };
  }, [securityScore]);

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
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Security Status
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Last checked: {new Date(securityStatus.lastCheck).toLocaleString()}
            </p>
          </div>
        </div>
        
        <button
          onClick={checkSecurityStatus}
          disabled={isChecking}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
          {isChecking ? 'Checking...' : 'Check Security'}
        </button>
      </div>

      {/* Security Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Security Score
            </h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${securityLevel.bg} ${securityLevel.color}`}>
              {securityLevel.level.toUpperCase()}
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {securityScore}/100
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                securityScore >= 90 ? 'bg-green-500' :
                securityScore >= 75 ? 'bg-blue-500' :
                securityScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${securityScore}%` }}
            ></div>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Active Threats
          </h3>
          <div className="text-3xl font-bold text-red-600 mb-2">
            {securityStatus.threats.filter(t => !t.resolved).length}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {securityStatus.threats.filter(t => !t.resolved).length === 0 
              ? 'No active threats' 
              : 'Threats require attention'
            }
          </p>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Vulnerabilities
          </h3>
          <div className="text-3xl font-bold text-orange-600 mb-2">
            {securityStatus.vulnerabilities.length}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {securityStatus.vulnerabilities.length === 0 
              ? 'No vulnerabilities detected' 
              : 'Vulnerabilities found'
            }
          </p>
        </div>
      </div>

      {/* Security Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            System Security
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Device Security</span>
              <div className="flex items-center space-x-2">
                {securityStatus.deviceSecurity ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                )}
                <span className={securityStatus.deviceSecurity ? 'text-green-600' : 'text-red-600'}>
                  {securityStatus.deviceSecurity ? 'Secure' : 'At Risk'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">WebAuthn Support</span>
              <div className="flex items-center space-x-2">
                {securityStatus.webAuthnSupported ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                )}
                <span className={securityStatus.webAuthnSupported ? 'text-green-600' : 'text-yellow-600'}>
                  {securityStatus.webAuthnSupported ? 'Available' : 'Limited'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Supply Chain</span>
              <div className="flex items-center space-x-2">
                {securityStatus.supplyChainSecurity ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                )}
                <span className={securityStatus.supplyChainSecurity ? 'text-green-600' : 'text-red-600'}>
                  {securityStatus.supplyChainSecurity ? 'Secure' : 'At Risk'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Security Settings
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Auto Lock</span>
              <button
                onClick={() => updateSecuritySetting('autoLock', !securitySettings.autoLock)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  securitySettings.autoLock ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.autoLock ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Biometric Required</span>
              <button
                onClick={() => updateSecuritySetting('biometricRequired', !securitySettings.biometricRequired)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  securitySettings.biometricRequired ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  securitySettings.biometricRequired ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Session Timeout</span>
              <select
                value={securitySettings.sessionTimeout}
                onChange={(e) => updateSecuritySetting('sessionTimeout', parseInt(e.target.value))}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Threat History */}
      <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Security Events
          </h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="inline-flex items-center px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4 mr-1" />
            {showAdvanced ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
        
        <div className="space-y-3">
          {threatHistory.slice(0, showAdvanced ? undefined : 5).map((threat) => (
            <div key={threat.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  threat.severity === 'high' ? 'bg-red-500' :
                  threat.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                }`} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {threat.description}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(threat.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                {threat.resolved ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                )}
                <span className={`text-sm ${
                  threat.resolved ? 'text-green-600' : 'text-yellow-600'
                }`}>
                  {threat.resolved ? 'Resolved' : 'Active'}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {threatHistory.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No security events recorded</p>
          </div>
        )}
      </div>
    </div>
  );
});

SecurityPanel.displayName = 'SecurityPanel';
