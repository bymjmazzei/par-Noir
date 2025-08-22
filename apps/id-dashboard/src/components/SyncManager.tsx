import React, { useState, useEffect } from 'react';

interface SyncSchedule {
  enabled: boolean;
  frequency: 'manual' | 'hourly' | 'daily' | 'weekly';
  lastSync: Date | null;
  nextSync: Date | null;
}

interface NetworkQuality {
  status: 'excellent' | 'good' | 'poor' | 'offline';
  speed: number; // Mbps
  latency: number; // ms
  reliability: number; // percentage
}

interface SyncManagerProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: SyncSchedule;
  onScheduleChange: (schedule: SyncSchedule) => void;
}

export const SyncManager: React.FC<SyncManagerProps> = ({
  isOpen,
  onClose,
  schedule,
  onScheduleChange
}) => {
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>({
    status: 'offline',
    speed: 0,
    latency: 0,
    reliability: 0
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [localSchedule, setLocalSchedule] = useState<SyncSchedule>(schedule);

  // Monitor network quality
  useEffect(() => {
    const checkNetworkQuality = async () => {
      if (!navigator.onLine) {
        setNetworkQuality({
          status: 'offline',
          speed: 0,
          latency: 0,
          reliability: 0
        });
        return;
      }

      try {
        // Simple network speed test
        const startTime = performance.now();
        await fetch('/api/ping', { 
          method: 'HEAD',
          cache: 'no-cache'
        });
        const endTime = performance.now();
        const latency = endTime - startTime;

        // Estimate network quality based on latency
        let status: NetworkQuality['status'] = 'excellent';
        let reliability = 100;

        if (latency > 1000) {
          status = 'poor';
          reliability = 50;
        } else if (latency > 500) {
          status = 'good';
          reliability = 80;
        }

        setNetworkQuality({
          status,
          speed: Math.random() * 100 + 10, // Mock speed
          latency: Math.round(latency),
          reliability
        });
      } catch (error) {
        setNetworkQuality({
          status: 'poor',
          speed: 0,
          latency: 0,
          reliability: 30
        });
      }
    };

    checkNetworkQuality();
    const interval = setInterval(checkNetworkQuality, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Calculate next sync time
  useEffect(() => {
    if (localSchedule.enabled && localSchedule.frequency !== 'manual') {
      const now = new Date();
      let nextSync = new Date(now);

      switch (localSchedule.frequency) {
        case 'hourly':
          nextSync.setHours(now.getHours() + 1, 0, 0, 0);
          break;
        case 'daily':
          nextSync.setDate(now.getDate() + 1);
          nextSync.setHours(2, 0, 0, 0); // 2 AM
          break;
        case 'weekly':
          nextSync.setDate(now.getDate() + 7);
          nextSync.setHours(2, 0, 0, 0); // 2 AM
          break;
      }

      setLocalSchedule(prev => ({ ...prev, nextSync }));
    }
  }, [localSchedule.enabled, localSchedule.frequency]);

  const handleScheduleChange = (key: keyof SyncSchedule, value: any) => {
    const newSchedule = { ...localSchedule, [key]: value };
    setLocalSchedule(newSchedule);
    onScheduleChange(newSchedule);
  };

  const handleManualSync = async () => {
    if (networkQuality.status === 'offline') {
      alert('Cannot sync while offline. Please check your internet connection.');
      return;
    }

    setIsSyncing(true);
    setSyncProgress(0);

    // Simulate sync process
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setSyncProgress(i);
    }

    const now = new Date();
    handleScheduleChange('lastSync', now);
    setIsSyncing(false);
    setSyncProgress(0);
  };

  const getNetworkStatusColor = (status: NetworkQuality['status']) => {
    switch (status) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-yellow-600';
      case 'poor': return 'text-orange-600';
      case 'offline': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getNetworkStatusIcon = (status: NetworkQuality['status']) => {
    switch (status) {
      case 'excellent': return '📶';
      case 'good': return '📶';
      case 'poor': return '📶';
      case 'offline': return '❌';
      default: return '❓';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Sync Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* Network Quality Indicator */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-medium mb-3">Network Status</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center mb-2">
                  <span className="mr-2">{getNetworkStatusIcon(networkQuality.status)}</span>
                  <span className={`font-medium ${getNetworkStatusColor(networkQuality.status)}`}>
                    {networkQuality.status.charAt(0).toUpperCase() + networkQuality.status.slice(1)}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Latency: {networkQuality.latency}ms
                </div>
                <div className="text-sm text-gray-600">
                  Reliability: {networkQuality.reliability}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Connection Quality</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all ${
                      networkQuality.reliability > 80 ? 'bg-green-500' :
                      networkQuality.reliability > 60 ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${networkQuality.reliability}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Sync Schedule */}
          <div>
            <h3 className="text-lg font-medium mb-3">Sync Schedule</h3>
            <div className="space-y-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={localSchedule.enabled}
                  onChange={(e) => handleScheduleChange('enabled', e.target.checked)}
                  className="mr-2"
                />
                <span>Enable automatic sync</span>
              </label>

              {localSchedule.enabled && (
                <div>
                  <label className="block text-sm font-medium mb-2">Sync Frequency</label>
                  <select
                    value={localSchedule.frequency}
                    onChange={(e) => handleScheduleChange('frequency', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="manual">Manual only</option>
                    <option value="hourly">Every hour</option>
                    <option value="daily">Daily at 2 AM</option>
                    <option value="weekly">Weekly on Sunday at 2 AM</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Sync Status */}
          <div>
            <h3 className="text-lg font-medium mb-3">Sync Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Last sync:</span>
                <span className="font-medium">
                  {localSchedule.lastSync 
                    ? localSchedule.lastSync.toLocaleString()
                    : 'Never'
                  }
                </span>
              </div>
              {localSchedule.nextSync && (
                <div className="flex justify-between">
                  <span>Next sync:</span>
                  <span className="font-medium">
                    {localSchedule.nextSync.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Manual Sync */}
          <div>
            <h3 className="text-lg font-medium mb-3">Manual Sync</h3>
            <div className="space-y-4">
              <button
                onClick={handleManualSync}
                disabled={isSyncing || networkQuality.status === 'offline'}
                className={`w-full py-2 px-4 rounded-md transition-colors ${
                  isSyncing || networkQuality.status === 'offline'
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>

              {isSyncing && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${syncProgress}%` }}
                  ></div>
                </div>
              )}
            </div>
          </div>

          {/* Sync Options */}
          <div>
            <h3 className="text-lg font-medium mb-3">Sync Options</h3>
            <div className="space-y-3">
              <label className="flex items-center">
                <input type="checkbox" className="mr-2" defaultChecked />
                <span>Sync identities</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="mr-2" defaultChecked />
                <span>Sync recovery keys</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="mr-2" defaultChecked />
                <span>Sync settings</span>
              </label>
              <label className="flex items-center">
                <input type="checkbox" className="mr-2" />
                <span>Sync analytics data (if enabled)</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => {
                onScheduleChange(localSchedule);
                onClose();
              }}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 