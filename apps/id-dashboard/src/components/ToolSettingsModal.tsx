import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { GlobalPrivacySettings } from '../types/privacy';

interface ToolSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  toolId: string;
  settings: GlobalPrivacySettings;
  onSettingsChange: (settings: GlobalPrivacySettings) => void;
}

export const ToolSettingsModal: React.FC<ToolSettingsModalProps> = ({
  isOpen,
  onClose,
  toolId,
  settings,
  onSettingsChange
}) => {
  const tool = settings.toolPermissions[toolId];
  const [localSettings, setLocalSettings] = useState<GlobalPrivacySettings>(settings);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [selectedDataPoint, setSelectedDataPoint] = useState<{
    key: string;
    label: string;
    description: string;
    category: string;
    requestedBy: string[];
  } | null>(null);

  if (!isOpen || !tool) return null;

  const handleDataPointChange = (dataPointKey: string, value: boolean) => {
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

  const handleSave = () => {
    onSettingsChange(localSettings);
    onClose();
  };

  const handleReset = () => {
    setLocalSettings(settings);
  };

  const handleShowInfo = (dataPoint: any) => {
    setSelectedDataPoint(dataPoint);
    setShowInfoModal(true);
  };

  const getDataPointDetails = (dataPointKey: string) => {
    const details: { [key: string]: { title: string; explanation: string; examples: string[]; risks: string[] } } = {
      'userFiles': {
        title: 'User Files Access',
        explanation: 'This tool can read, write, and manage your encrypted files stored in the system.',
        examples: [
          'Upload and download files',
          'Create and organize folders',
          'Share files with other users',
          'Access file metadata (size, type, creation date)'
        ],
        risks: [
          'Tool can see file names and metadata',
          'Tool can modify or delete your files',
          'Tool can share your files with others'
        ]
      },
      'fileMetadata': {
        title: 'File Metadata Access',
        explanation: 'This tool can access information about your files without reading the actual content.',
        examples: [
          'View file names and types',
          'See file sizes and creation dates',
          'Access folder structure',
          'Check file permissions'
        ],
        risks: [
          'Tool can see what files you have',
          'Tool can infer your activities from file names',
          'Tool can see your file organization patterns'
        ]
      },
      'storagePreferences': {
        title: 'Storage Preferences',
        explanation: 'This tool can access your storage settings and preferences.',
        examples: [
          'View storage quota and usage',
          'Access backup settings',
          'See encryption preferences',
          'Check sync settings'
        ],
        risks: [
          'Tool can see your storage habits',
          'Tool can access your backup preferences',
          'Tool can see your security settings'
        ]
      },
      'userMessages': {
        title: 'User Messages Access',
        explanation: 'This tool can read, send, and manage your encrypted messages.',
        examples: [
          'Read your message history',
          'Send messages on your behalf',
          'Access message metadata',
          'Manage message threads'
        ],
        risks: [
          'Tool can read all your messages',
          'Tool can send messages as you',
          'Tool can see who you communicate with'
        ]
      },
      'contactList': {
        title: 'Contact List Access',
        explanation: 'This tool can access your contact information and relationships.',
        examples: [
          'View your contact list',
          'See contact details and relationships',
          'Access contact preferences',
          'Manage contact groups'
        ],
        risks: [
          'Tool can see who you know',
          'Tool can access contact details',
          'Tool can see your social connections'
        ]
      },
      'messagePreferences': {
        title: 'Message Preferences',
        explanation: 'This tool can access your messaging settings and preferences.',
        examples: [
          'View notification settings',
          'Access privacy preferences',
          'See message encryption settings',
          'Check auto-reply settings'
        ],
        risks: [
          'Tool can see your communication preferences',
          'Tool can access your privacy settings',
          'Tool can see your notification habits'
        ]
      },
      'paymentHistory': {
        title: 'Payment History Access',
        explanation: 'This tool can access your payment and transaction information.',
        examples: [
          'View transaction history',
          'Access payment methods',
          'See subscription details',
          'Check billing information'
        ],
        risks: [
          'Tool can see your spending patterns',
          'Tool can access payment details',
          'Tool can see your subscription status'
        ]
      },
      'revenueData': {
        title: 'Revenue Data Access',
        explanation: 'This tool can access your income and revenue information.',
        examples: [
          'View revenue streams',
          'Access earnings data',
          'See monetization metrics',
          'Check payment processing'
        ],
        risks: [
          'Tool can see your income sources',
          'Tool can access financial data',
          'Tool can see your business metrics'
        ]
      },
      'subscriptionInfo': {
        title: 'Subscription Information',
        explanation: 'This tool can access your subscription and membership details.',
        examples: [
          'View active subscriptions',
          'Access billing cycles',
          'See membership levels',
          'Check renewal dates'
        ],
        risks: [
          'Tool can see your subscription habits',
          'Tool can access billing information',
          'Tool can see your membership status'
        ]
      }
    };

    return details[dataPointKey] || {
      title: dataPointKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      explanation: 'This tool can access this type of data.',
      examples: ['Access to this data type'],
      risks: ['Tool can see this information']
    };
  };

  // Group data points by category
  const groupedDataPoints = Object.entries(localSettings.dataPoints).reduce((acc, [key, dataPoint]) => {
    if (!acc[dataPoint.category]) {
      acc[dataPoint.category] = [];
    }
    acc[dataPoint.category].push({ key, ...dataPoint });
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
        <div className="bg-modal-bg rounded-lg p-6 max-w-2xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-semibold">{tool.toolName} Settings</h2>
              <p className="text-sm text-text-secondary mt-1">{tool.toolDescription}</p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
          </div>

          <div className="space-y-6">
            {/* Tool Status */}
            <div className="bg-secondary border border-border rounded-lg p-4">
              <h3 className="font-medium text-text-primary mb-3">Tool Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Status:</span>
                  <span className={`font-medium ${
                    tool.status === 'active' ? 'text-green-600' : 
                    tool.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {tool.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Granted:</span>
                  <span className="text-text-primary">{new Date(tool.grantedAt).toLocaleDateString()}</span>
                </div>
                {tool.expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Expires:</span>
                    <span className="text-text-primary">{new Date(tool.expiresAt).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-text-secondary">Data Points:</span>
                  <span className="text-text-primary">{tool.dataPoints.length}</span>
                </div>
              </div>
            </div>

            {/* Data Point Permissions */}
            {Object.keys(groupedDataPoints).length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-4">Data Point Permissions</h3>
                <p className="text-sm text-text-secondary mb-4">
                  Control which data points this tool can access. Global settings override these permissions.
                </p>
                
                {Object.entries(groupedDataPoints).map(([category, dataPoints]) => (
                  <div key={category} className="mb-6">
                    <h4 className="font-medium text-text-primary mb-3 capitalize">{category} Data</h4>
                    <div className="space-y-3">
                      {dataPoints.map(({ key, label, description, globalSetting, requestedBy }) => (
                        <div key={key} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <div className="font-medium">{label}</div>
                                <button
                                  onClick={() => handleShowInfo({ key, label, description, category, requestedBy })}
                                  className="text-blue-600 hover:text-blue-800 text-sm"
                                  title="Learn more about this data point"
                                >
                                  <Info className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="text-sm text-text-secondary">{description}</div>
                              <div className="text-xs text-text-secondary mt-1">
                                Requested by: {requestedBy.join(', ')}
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <div className="text-xs text-text-secondary">
                                {globalSetting ? 'Global: ON' : 'Global: OFF'}
                              </div>
                              <input
                                type="checkbox"
                                checked={tool.dataPoints.includes(key)}
                                onChange={(e) => handleDataPointChange(key, e.target.checked)}
                                disabled={localSettings.allowAllToolAccess || !globalSetting}
                                className="ml-2"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {Object.keys(groupedDataPoints).length === 0 && (
              <div className="text-center py-8 text-text-secondary">
                <p>No data points available for this tool</p>
                <p className="text-sm">Data points will appear here as the tool requests access</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3 pt-4 border-t border-border">
              <button
                onClick={handleSave}
                className="flex-1 modal-button py-2 px-4 rounded-md transition-colors"
              >
                Save Settings
              </button>
              <button
                onClick={handleReset}
                className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Modal */}
      {showInfoModal && selectedDataPoint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
          <div className="bg-modal-bg rounded-lg p-6 max-w-lg w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Data Point Details</h2>
              <button onClick={() => setShowInfoModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">{selectedDataPoint.label}</h3>
                <p className="text-sm text-text-secondary mb-4">
                  {getDataPointDetails(selectedDataPoint.key).explanation}
                </p>
              </div>

              <div>
                <h4 className="font-medium text-text-primary mb-3">What this tool can do:</h4>
                <ul className="space-y-2 text-sm text-text-secondary">
                  {getDataPointDetails(selectedDataPoint.key).examples.map((example, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-green-600 mt-1">•</span>
                      <span>{example}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-text-primary mb-3">Privacy considerations:</h4>
                <ul className="space-y-2 text-sm text-text-secondary">
                  {getDataPointDetails(selectedDataPoint.key).risks.map((risk, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-yellow-600 mt-1">⚠</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="modal-button py-2 px-4 rounded-md transition-colors"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}; 