import React, { useState, useEffect } from 'react';
import { GlobalPrivacySettings } from '../../types/privacy';
import { SectionInfo } from '../common/SectionInfo';

interface AdvancedPrivacySettingsBodyProps {
  settings: GlobalPrivacySettings;
  onSettingsChange: (settings: GlobalPrivacySettings) => void;
}

/** Inline advanced privacy controls (no modal chrome). */
export const AdvancedPrivacySettingsBody: React.FC<AdvancedPrivacySettingsBodyProps> = ({
  settings,
  onSettingsChange
}) => {
  const [localSettings, setLocalSettings] = useState<GlobalPrivacySettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const groupedDataPoints = Object.entries(localSettings.dataPoints).reduce(
    (acc, [key, dataPoint]) => {
      const cat = dataPoint.category;
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push({ key, ...dataPoint });
      return acc;
    },
    {} as Record<string, Array<{ key: string } & (typeof localSettings.dataPoints)[string]>>
  );

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
    if (!tool) return;
    const newDataPoints = value
      ? [...tool.dataPoints, dataPointKey]
      : tool.dataPoints.filter((dp: string) => dp !== dataPointKey);

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

  return (
    <div className="space-y-8 text-text-primary">
      <div className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-lg font-medium text-text-primary">Global Settings</h3>
          <SectionInfo title="Global Settings">
            <p>These settings override all tool-specific permissions</p>
          </SectionInfo>
        </div>
        <div className="space-y-3">
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

      {Object.keys(groupedDataPoints).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-medium">Data Access Control</h3>
            <SectionInfo title="Data Access Control">
              <p>Control access to specific data points. Global settings override individual tool permissions.</p>
            </SectionInfo>
          </div>
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

      {Object.keys(localSettings.toolPermissions).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-lg font-medium">Tool Permissions</h3>
            <SectionInfo title="Tool Permissions">
              <p>Manage permissions for individual tools</p>
            </SectionInfo>
          </div>
          <div className="space-y-4">
            {Object.entries(localSettings.toolPermissions).map(([toolId, tool]) => (
              <div key={toolId} className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium">{tool.toolName}</div>
                    <div className="text-sm text-text-secondary">{tool.toolDescription}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeTool(toolId)}
                    className="text-red-600 text-sm hover:text-red-800"
                  >
                    Revoke Access
                  </button>
                </div>
                {tool.dataPoints.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-text-primary">Data Access:</div>
                    {tool.dataPoints.map((dataPointKey: string) => {
                      const dataPoint = localSettings.dataPoints[dataPointKey];
                      return (
                        <div key={dataPointKey} className="flex items-center justify-between text-sm">
                          <span className="text-text-secondary">{dataPoint?.label || dataPointKey}</span>
                          <input
                            type="checkbox"
                            checked={tool.dataPoints.includes(dataPointKey)}
                            onChange={(e) =>
                              handleToolPermissionChange(toolId, dataPointKey, e.target.checked)
                            }
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

      {Object.keys(localSettings.dataPoints).length === 0 &&
        Object.keys(localSettings.toolPermissions).length === 0 && (
          <div className="text-center py-4 text-text-secondary text-sm">
            <p>No extra data-access or tool revoke settings yet</p>
          </div>
        )}
    </div>
  );
};
