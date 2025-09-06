import React, { useState } from 'react';
import { Shield, Settings, CheckCircle, AlertTriangle } from 'lucide-react';

interface ThreatEvent {
  id: string;
  timestamp: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  resolved: boolean;
}

interface ThreatHistoryPanelProps {
  threats: ThreatEvent[];
}

export const ThreatHistoryPanel: React.FC<ThreatHistoryPanelProps> = React.memo(({ threats }) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
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
        {threats.slice(0, showAdvanced ? undefined : 5).map((threat) => (
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
      
      {threats.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No security events recorded</p>
        </div>
      )}
    </div>
  );
});

ThreatHistoryPanel.displayName = 'ThreatHistoryPanel';
