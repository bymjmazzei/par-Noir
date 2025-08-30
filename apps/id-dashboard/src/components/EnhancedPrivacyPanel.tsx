import React, { useState } from 'react';
import { GlobalPrivacySettings } from '../types/privacy';

interface EnhancedPrivacyPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GlobalPrivacySettings;
  onSettingsChange: (settings: GlobalPrivacySettings) => void;
}

export const EnhancedPrivacyPanel: React.FC<EnhancedPrivacyPanelProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange
}) => {
  const [localSettings, setLocalSettings] = useState<GlobalPrivacySettings>(settings);

  // Group data points by category
  const groupedDataPoints = Object.entries(localSettings.dataPoints).reduce((acc, [key, dataPoint]) => {
    if (!acc[dataPoint.category]) {
      acc[dataPoint.category] = [];
    }
    acc[dataPoint.category].push({ key, ...dataPoint });
    return acc;
  }, {} as Record<string, any[]>);

  const handleGlobalSettingChange = (key: keyof GlobalPrivacySettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleDataPointChange = (dataPointKey: string, value: boolean) => {
    const newSettings = {
      ...localSettings,
      dataPoints: {
        ...localSettings.dataPoints,
        [dataPointKey]: {
          ...localSettings.dataPoints[dataPointKey],
          globalSetting: value
        }
      }
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleToolPermissionChange = (toolId: string, dataPointKey: string, value: boolean) => {
    const tool = localSettings.toolPermissions[toolId];
    const newDataPoints = value 
      ? [...tool.dataPoints, dataPointKey]
      : tool.dataPoints.filter(dp => dp !== dataPointKey);

    const newSettings = {
      ...localSettings,
      toolPermissions: {
        ...localSettings.toolPermissions,
        [toolId]: {
          ...tool,
          dataPoints: newDataPoints
        }
      }
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  const handleRevokeTool = (toolId: string) => {
    const newSettings = {
      ...localSettings,
      toolPermissions: {
        ...localSettings.toolPermissions,
        [toolId]: {
          ...localSettings.toolPermissions[toolId],
          status: 'revoked' as const
        }
      }
    };
    setLocalSettings(newSettings);
    onSettingsChange(newSettings);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Privacy & Sharing Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="space-y-8">
          {/* Global Settings */}
          <div className="bg-secondary border border-border rounded-lg p-4">
            <h3 className="text-lg font-medium text-text-primary mb-3">Global Settings</h3>
            <p className="text-sm text-text-secondary mb-4">
              These settings override all tool-specific permissions
            </p>
            
            <div className="space-y-3">
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Allow All Tool Access</div>
                  <div className="text-sm text-text-secondary">Override all tool permissions</div>
                </div>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={(e) => {}}
                  className="ml-4"
                  disabled
                />
              </label>
              
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Allow Analytics</div>
                  <div className="text-sm text-text-secondary">Share usage analytics</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.allowAnalytics}
                  onChange={(e) => handleGlobalSettingChange('allowAnalytics', e.target.checked)}
                  className="ml-4"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Allow Marketing</div>
                  <div className="text-sm text-text-secondary">Allow marketing communications</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.allowMarketing}
                  onChange={(e) => handleGlobalSettingChange('allowMarketing', e.target.checked)}
                  className="ml-4"
                />
              </label>
              
              <label className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Allow Third-Party Sharing</div>
                  <div className="text-sm text-text-secondary">Share data with external services</div>
                </div>
                <input
                  type="checkbox"
                  checked={localSettings.allowThirdPartySharing}
                  onChange={(e) => handleGlobalSettingChange('allowThirdPartySharing', e.target.checked)}
                  className="ml-4"
                />
              </label>
            </div>
          </div>

          {/* Dynamic Data Points */}
          {Object.keys(groupedDataPoints).length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-4">Data Access Control</h3>
              <p className="text-sm text-text-secondary mb-4">
                Control access to specific data points. Global settings override individual tool permissions.
              </p>
              
              {Object.entries(groupedDataPoints).map(([category, dataPoints]) => (
                <div key={category} className="mb-6">
                  <h4 className="font-medium text-text-primary mb-3 capitalize">{category} Data</h4>
                  <div className="space-y-3">
                    {dataPoints.map(({ key, label, description, globalSetting, requestedBy }) => (
                      <div key={key} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="font-medium">{label}</div>
                            <div className="text-sm text-text-secondary">{description}</div>
                            <div className="text-xs text-text-secondary mt-1">
                              Requested by: {requestedBy.join(', ')}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={globalSetting}
                            onChange={(e) => handleDataPointChange(key, e.target.checked)}
                            className="ml-4"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tool Permissions */}
          {Object.keys(localSettings.toolPermissions).length > 0 && (
            <div>
              <h3 className="text-lg font-medium mb-4">Tool Permissions</h3>
              <p className="text-sm text-text-secondary mb-4">
                Manage permissions for individual tools
              </p>
              
              <div className="space-y-4">
                {Object.entries(localSettings.toolPermissions).map(([toolId, tool]) => (
                  <div key={toolId} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium">{tool.toolName}</div>
                        <div className="text-sm text-text-secondary">{tool.toolDescription}</div>
                        <div className="text-xs text-text-secondary">
                          Status: {tool.status} • Granted: {new Date(tool.grantedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRevokeTool(toolId)}
                        className="text-red-600 text-sm hover:text-red-800"
                      >
                        Revoke Access
                      </button>
                    </div>
                    
                    {tool.dataPoints.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-text-primary">Data Access:</div>
                        {tool.dataPoints.map(dataPointKey => {
                          const dataPoint = localSettings.dataPoints[dataPointKey];
                          return (
                            <div key={dataPointKey} className="flex items-center justify-between text-sm">
                              <span className="text-text-secondary">{dataPoint?.label || dataPointKey}</span>
                              <input
                                type="checkbox"
                                checked={tool.dataPoints.includes(dataPointKey)}
                                onChange={(e) => handleToolPermissionChange(toolId, dataPointKey, e.target.checked)}
                                disabled={false}
                                className="ml-2"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {Object.keys(localSettings.dataPoints).length === 0 && 
           Object.keys(localSettings.toolPermissions).length === 0 && (
            <div className="text-center py-8 text-text-secondary">
              <p>No data points or tool permissions yet</p>
              <p className="text-sm">Data points will appear here as tools request access</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="flex-1 modal-button py-2 px-4 rounded-md transition-colors"
            >
              Save Settings
            </button>
            <button
              onClick={() => setLocalSettings(settings)}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}; 