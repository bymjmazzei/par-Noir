import React, { useState, useEffect } from 'react';
import { threatDetector, type SecurityEvent } from '../../utils/security';

export const AdvancedSecurityDashboard: React.FC = React.memo(() => {
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    // Load existing security events
    setSecurityEvents(threatDetector.getSecurityEvents());
    
    // Listen for new security events
    const handleSecurityEvent = (event: CustomEvent) => {
      setSecurityEvents(prev => [event.detail, ...prev]);
    };
    
    window.addEventListener('security-event', handleSecurityEvent);
    
    return () => {
      window.removeEventListener('security-event', handleSecurityEvent);
    };
  }, []);

  const startMonitoring = () => {
    threatDetector.startMonitoring();
    setIsMonitoring(true);
  };

  const stopMonitoring = () => {
    threatDetector.stopMonitoring();
    setIsMonitoring(false);
  };

  const clearEvents = () => {
    threatDetector.clearSecurityEvents();
    setSecurityEvents([]);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Advanced Security Dashboard
        </h2>
        <div className="flex space-x-3">
          {!isMonitoring ? (
            <button
              onClick={startMonitoring}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Start Monitoring
            </button>
          ) : (
            <button
              onClick={stopMonitoring}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Stop Monitoring
            </button>
          )}
          <button
            onClick={clearEvents}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
            Clear Events
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Security Status
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Monitoring:</span>
              <span className={isMonitoring ? 'text-green-600' : 'text-red-600'}>
                {isMonitoring ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total Events:</span>
              <span className="text-gray-900 dark:text-white font-semibold">
                {securityEvents.length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600 dark:text-gray-400">Critical Events:</span>
              <span className="text-red-600 font-semibold">
                {securityEvents.filter(e => e.severity === 'critical').length}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Threat Patterns
          </h3>
          <div className="space-y-2">
            {threatDetector.getThreatPatterns().map(pattern => (
              <div key={pattern.id} className="flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-400">{pattern.name}:</span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(pattern.severity)}`}>
                  {pattern.severity}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Recent Activity
          </h3>
          <div className="space-y-2">
            {securityEvents.slice(0, 5).map(event => (
              <div key={event.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(event.severity)}`}>
                    {event.severity}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300 mt-1">{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {securityEvents.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Security Event Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {securityEvents.map(event => (
                  <tr key={event.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {event.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(event.severity)}`}>
                        {event.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                      {event.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${event.resolved ? 'text-green-600 bg-green-100' : 'text-yellow-600 bg-yellow-100'}`}>
                        {event.resolved ? 'Resolved' : 'Open'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
});

AdvancedSecurityDashboard.displayName = 'AdvancedSecurityDashboard';