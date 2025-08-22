import { GlobalPrivacySettings, ToolAccessRequest } from '../types/privacy';

// Demo tool requests to populate data points
export const demoToolRequests: ToolAccessRequest[] = [
  {
    toolId: 'storage-tool',
    toolName: 'Storage Tool',
    toolDescription: 'Encrypted file storage and sharing',
    requestedData: ['userFiles', 'fileMetadata', 'storagePreferences'],
    permissions: ['read', 'write'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
  },
  {
    toolId: 'messaging-tool',
    toolName: 'Messaging Tool',
    toolDescription: 'Secure DID-to-DID messaging',
    requestedData: ['userMessages', 'contactList', 'messagePreferences'],
    permissions: ['read', 'write'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    toolId: 'monetization-tool',
    toolName: 'Monetization Tool',
    toolDescription: 'Payment and revenue management',
    requestedData: ['paymentHistory', 'revenueData', 'subscriptionInfo'],
    permissions: ['read', 'write'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  }
];

// Simulate tool requesting access
export const simulateToolRequest = async (request: ToolAccessRequest): Promise<GlobalPrivacySettings> => {
  // Simulate API call to register data points
  const response = await fetch('/api/privacy/register-data-point', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolId: request.toolId,
      dataPointKey: request.requestedData[0],
      label: request.requestedData[0].replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
      description: `Data point requested by ${request.toolName}`,
      category: 'content'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to register data point');
  }

  // Return updated settings (in real implementation, this would come from the server)
  return {
    allowAllToolAccess: true,
    allowAnalytics: true,
    allowMarketing: false,
    allowThirdPartySharing: true,
    dataPoints: {
      [request.requestedData[0]]: {
        label: request.requestedData[0].replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
        description: `Data point requested by ${request.toolName}`,
        category: 'content' as const,
        requestedBy: [request.toolId],
        globalSetting: true,
        lastUpdated: new Date().toISOString()
      }
    },
    toolPermissions: {
      [request.toolId]: {
        toolName: request.toolName,
        toolDescription: request.toolDescription,
        permissions: request.permissions,
        dataPoints: request.requestedData,
        grantedAt: new Date().toISOString(),
        expiresAt: request.expiresAt,
        status: 'active' as const
      }
    }
  };
};

// Demo function to populate privacy settings with sample data
export const populateDemoData = (): GlobalPrivacySettings => {
  const dataPoints: GlobalPrivacySettings['dataPoints'] = {};
  const toolPermissions: GlobalPrivacySettings['toolPermissions'] = {};

  // Add data points from demo tools
  demoToolRequests.forEach(request => {
    request.requestedData.forEach(dataPointKey => {
      dataPoints[dataPointKey] = {
        label: dataPointKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
        description: `Data point requested by ${request.toolName}`,
        category: dataPointKey.includes('File') || dataPointKey.includes('Message') ? 'content' : 
                 dataPointKey.includes('Payment') || dataPointKey.includes('Revenue') ? 'analytics' : 'preferences',
        requestedBy: [request.toolId],
        globalSetting: true,
        lastUpdated: new Date().toISOString()
      };
    });

    toolPermissions[request.toolId] = {
      toolName: request.toolName,
      toolDescription: request.toolDescription,
      permissions: request.permissions,
      dataPoints: request.requestedData,
      grantedAt: new Date().toISOString(),
      expiresAt: request.expiresAt,
      status: 'active' as const
    };
  });

  return {
    allowAllToolAccess: true,
    allowAnalytics: true,
    allowMarketing: false,
    allowThirdPartySharing: true,
    dataPoints,
    toolPermissions
  };
}; 