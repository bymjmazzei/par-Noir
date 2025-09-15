import React, { useState } from 'react';
import { Shield, Lock, BarChart3 } from 'lucide-react';
import { useRealtimeSecurity } from '../hooks/useRealtimeSecurity';

interface RealtimeSecurityAlertsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RealtimeSecurityAlerts: React.FC<RealtimeSecurityAlertsProps> = ({
  isOpen,
  onClose
}) => {
  const {
    isConnected,
    connectionError,
    securityAlerts,
    sessionUpdates,
    toolAccessUpdates,
    recoveryStatusUpdates,
    clearAlerts,
    clearSessionUpdates,
    clearToolAccessUpdates,
    clearRecoveryStatusUpdates
  } = useRealtimeSecurity();

  const [activeTab, setActiveTab] = useState<'alerts' | 'sessions' | 'tools' | 'recovery'>('alerts');

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'brute-force': return <Lock className="w-4 h-4" />;
      case 'suspicious-login': return '⚠️';
      case 'data-access-violation': return '🚫';
      case 'tool-access-blocked': return <Shield className="w-4 h-4" />;
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return time.toLocaleDateString();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <h2 className="text-2xl font-bold text-text-primary">Real-time Security</h2>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-text-secondary">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {connectionError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <span className="text-red-600">⚠️</span>
              <span className="text-red-800">{connectionError}</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-border mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('alerts')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'alerts'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Security Alerts ({securityAlerts.length})
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sessions'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Session Updates ({sessionUpdates.length})
            </button>
            <button
              onClick={() => setActiveTab('tools')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tools'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Tool Access ({toolAccessUpdates.length})
            </button>
            <button
              onClick={() => setActiveTab('recovery')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'recovery'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Recovery Status ({recoveryStatusUpdates.length})
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {activeTab === 'alerts' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Security Alerts</h3>
                <button
                  onClick={clearAlerts}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-3">
                {securityAlerts.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary">
                    No security alerts
                  </div>
                ) : (
                  securityAlerts.map((alert) => (
                    <div key={alert.id} className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}>
                      <div className="flex items-start space-x-3">
                        <span className="text-lg">{getAlertIcon(alert.type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{alert.message}</div>
                            <span className="text-xs">{getTimeAgo(alert.timestamp)}</span>
                          </div>
                          <div className="text-sm mt-1">
                            Type: {alert.type.replace('-', ' ')} • Severity: {alert.severity}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Session Updates</h3>
                <button
                  onClick={clearSessionUpdates}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-3">
                {sessionUpdates.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary">
                    No session updates
                  </div>
                ) : (
                  sessionUpdates.map((update) => (
                    <div key={update.sessionId} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{update.deviceName}</div>
                          <div className="text-sm text-text-secondary">
                            {update.status} • {update.ipAddress} • {update.location}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm px-2 py-1 rounded ${
                            update.status === 'connected' ? 'bg-green-100 text-green-800' :
                            update.status === 'disconnected' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {update.status}
                          </div>
                          <div className="text-xs text-text-secondary mt-1">
                            {getTimeAgo(update.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Tool Access Updates</h3>
                <button
                  onClick={clearToolAccessUpdates}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-3">
                {toolAccessUpdates.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary">
                    No tool access updates
                  </div>
                ) : (
                  toolAccessUpdates.map((update) => (
                    <div key={`${update.toolId}-${update.timestamp}`} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{update.toolName}</div>
                          <div className="text-sm text-text-secondary">
                            {update.action} • {update.dataPoints.join(', ')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm px-2 py-1 rounded ${
                            update.action === 'granted' ? 'bg-green-100 text-green-800' :
                            update.action === 'revoked' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {update.action}
                          </div>
                          <div className="text-xs text-text-secondary mt-1">
                            {getTimeAgo(update.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'recovery' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Recovery Status Updates</h3>
                <button
                  onClick={clearRecoveryStatusUpdates}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-3">
                {recoveryStatusUpdates.length === 0 ? (
                  <div className="text-center py-8 text-text-secondary">
                    No recovery status updates
                  </div>
                ) : (
                  recoveryStatusUpdates.map((update) => (
                    <div key={update.requestId} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">Recovery Request {update.requestId}</div>
                          <div className="text-sm text-text-secondary">
                            {update.custodianName ? `Custodian: ${update.custodianName}` : 'No custodian'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm px-2 py-1 rounded ${
                            update.status === 'approved' ? 'bg-green-100 text-green-800' :
                            update.status === 'denied' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {update.status}
                          </div>
                          <div className="text-xs text-text-secondary mt-1">
                            {getTimeAgo(update.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 