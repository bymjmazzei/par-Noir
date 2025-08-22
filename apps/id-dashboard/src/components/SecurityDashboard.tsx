import React, { useState, useEffect } from 'react';
import { Shield, Lock, BarChart3, ChevronDown, ChevronUp, Settings } from 'lucide-react';

interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  recentThreats: any[];
  blockedAttempts: number;
  successfulAttacks: number;
}

interface SecurityEvent {
  id: string;
  timestamp: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  resolved: boolean;
  resolution?: string;
}

interface SecurityDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityDashboard: React.FC<SecurityDashboardProps> = ({
  isOpen,
  onClose
}) => {
  const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<SecurityEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSecurityData();
    }
  }, [isOpen]);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      // Simulate loading security data
      // In a real implementation, this would come from the security monitor
      const mockMetrics: SecurityMetrics = {
        totalEvents: 156,
        eventsByType: {
          BRUTE_FORCE_ATTEMPT: 23,
          SUSPICIOUS_LOGIN: 8,
          DATA_ACCESS_VIOLATION: 2,
          TOOL_ACCESS_BLOCKED: 45,
          ENCRYPTION_ERROR: 1,
          RATE_LIMIT_EXCEEDED: 67,
          INVALID_INPUT: 10
        },
        eventsBySeverity: {
          low: 89,
          medium: 45,
          high: 18,
          critical: 4
        },
        recentThreats: [],
        blockedAttempts: 135,
        successfulAttacks: 2
      };

      const mockEvents: SecurityEvent[] = [
        {
          id: 'sec_1',
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          type: 'BRUTE_FORCE_ATTEMPT',
          severity: 'high',
          source: 'Authentication',
                  details: { attempts: 15, ipAddress: '***.***.***.***' },
        ipAddress: '***.***.***.***',
          resolved: false
        },
        {
          id: 'sec_2',
          timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          type: 'TOOL_ACCESS_BLOCKED',
          severity: 'medium',
          source: 'PrivacyManager',
          details: { toolId: 'malicious-tool', reason: 'Suspicious patterns detected' },
          resolved: true,
          resolution: 'Tool blocked and logged'
        },
        {
          id: 'sec_3',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          type: 'SENSITIVE_DATA_REQUEST',
          severity: 'critical',
          source: 'ToolIntegration',
          details: { dataPoint: 'password', toolId: 'phishing-tool' },
          resolved: false
        }
      ];

      setMetrics(mockMetrics);
      setRecentEvents(mockEvents);
    } catch (error) {
      // Handle error silently
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'BRUTE_FORCE_ATTEMPT': return <Lock className="w-4 h-4" />;
      case 'SUSPICIOUS_LOGIN': return '⚠️';
      case 'DATA_ACCESS_VIOLATION': return '🚫';
      case 'TOOL_ACCESS_BLOCKED': return <Shield className="w-4 h-4" />;
      case 'ENCRYPTION_ERROR': return <Shield className="w-4 h-4" />;
      case 'RATE_LIMIT_EXCEEDED': return '⏱️';
      case 'INVALID_INPUT': return '❌';
      case 'SENSITIVE_DATA_REQUEST': return '🚨';
      default: return <BarChart3 className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-6xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-text-primary">Security Dashboard</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Security Overview - Always Visible */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-secondary rounded-lg p-4">
                <div className="text-sm text-text-secondary">Total Events</div>
                <div className="text-2xl font-bold text-text-primary">{metrics?.totalEvents}</div>
              </div>
              <div className="bg-secondary rounded-lg p-4">
                <div className="text-sm text-text-secondary">Blocked Attempts</div>
                <div className="text-2xl font-bold text-green-600">{metrics?.blockedAttempts}</div>
              </div>
              <div className="bg-secondary rounded-lg p-4">
                <div className="text-sm text-text-secondary">Successful Attacks</div>
                <div className="text-2xl font-bold text-red-600">{metrics?.successfulAttacks}</div>
              </div>
              <div className="bg-secondary rounded-lg p-4">
                <div className="text-sm text-text-secondary">Threat Level</div>
                <div className="text-2xl font-bold text-yellow-600">Medium</div>
              </div>
            </div>

            {/* Security Recommendations - Always Visible */}
            <div className="bg-secondary rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Security Recommendations</h3>
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <span className="text-yellow-600 text-lg">⚠️</span>
                  <div>
                    <div className="font-medium text-text-primary">Enable Two-Factor Authentication</div>
                    <div className="text-sm text-text-secondary">
                      Consider enabling 2FA for additional account security
                    </div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Lock className="w-6 h-6 text-blue-600" />
                  <div>
                    <div className="font-medium text-text-primary">Review Tool Permissions</div>
                    <div className="text-sm text-text-secondary">
                      Regularly review and update tool access permissions
                    </div>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <BarChart3 className="w-6 h-6 text-green-600" />
                  <div>
                    <div className="font-medium text-text-primary">Monitor Activity</div>
                    <div className="text-sm text-text-secondary">
                      Check this dashboard regularly for security insights
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="border border-border rounded-lg">
              <button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full flex items-center justify-between p-4 hover:bg-modal-bg transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Settings className="w-5 h-5 text-text-secondary" />
                  <span className="font-medium text-text-primary">Advanced Security Settings</span>
                </div>
                {showAdvancedSettings ? (
                  <ChevronUp className="w-5 h-5 text-text-secondary" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-text-secondary" />
                )}
              </button>

              {/* Advanced Settings Content */}
              {showAdvancedSettings && (
                <div className="border-t border-border p-6 space-y-6">
                  {/* Event Types Chart */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Events by Type</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {metrics?.eventsByType && Object.entries(metrics.eventsByType).map(([type, count]) => (
                        <div key={type} className="flex items-center space-x-2">
                          <span className="text-lg">{getEventTypeIcon(type)}</span>
                          <div>
                            <div className="text-sm text-text-secondary">{type.replace(/_/g, ' ')}</div>
                            <div className="font-semibold text-text-primary">{count}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Security Events */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recent Security Events</h3>
                    <div className="space-y-3">
                      {recentEvents.map((event) => (
                        <div
                          key={event.id}
                          className={`border border-border rounded-lg p-4 cursor-pointer hover:bg-modal-bg transition-colors ${
                            event.resolved ? 'opacity-60' : ''
                          }`}
                          onClick={() => setSelectedEvent(event)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <span className="text-lg">{getEventTypeIcon(event.type)}</span>
                              <div>
                                <div className="font-medium text-text-primary">{event.type.replace(/_/g, ' ')}</div>
                                <div className="text-sm text-text-secondary">
                                  {new Date(event.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(event.severity)}`}>
                                {event.severity}
                              </span>
                              {event.resolved && (
                                <span className="text-green-600 text-xs">✓ Resolved</span>
                              )}
                            </div>
                          </div>
                          {event.ipAddress && (
                            <div className="text-sm text-text-secondary mt-2">
                              IP: {event.ipAddress}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Event Detail Modal */}
        {selectedEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Event Details</h3>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-text-secondary hover:text-text-primary"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-text-secondary">Event Type</div>
                  <div className="font-medium">{selectedEvent.type.replace(/_/g, ' ')}</div>
                </div>
                
                <div>
                  <div className="text-sm text-text-secondary">Severity</div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getSeverityColor(selectedEvent.severity)}`}>
                    {selectedEvent.severity}
                  </span>
                </div>
                
                <div>
                  <div className="text-sm text-text-secondary">Timestamp</div>
                  <div className="font-medium">{new Date(selectedEvent.timestamp).toLocaleString()}</div>
                </div>
                
                <div>
                  <div className="text-sm text-text-secondary">Source</div>
                  <div className="font-medium">{selectedEvent.source}</div>
                </div>
                
                {selectedEvent.ipAddress && (
                  <div>
                    <div className="text-sm text-text-secondary">IP Address</div>
                    <div className="font-medium">{selectedEvent.ipAddress}</div>
                  </div>
                )}
                
                <div>
                  <div className="text-sm text-text-secondary">Details</div>
                  <div className="bg-modal-bg rounded p-3">
                    <pre className="text-sm overflow-x-auto">
                      {JSON.stringify(selectedEvent.details, null, 2)}
                    </pre>
                  </div>
                </div>
                
                {selectedEvent.resolution && (
                  <div>
                    <div className="text-sm text-text-secondary">Resolution</div>
                    <div className="font-medium text-green-600">{selectedEvent.resolution}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 