import React, { useState } from 'react';
import { CrossPlatformAuth } from '../components/CrossPlatformAuth';
import { ComplianceDataCollection } from '../components/ComplianceDataCollection';

export const SDKDocumentation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'integration' | 'compliance' | 'demo'>('overview');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'integration', label: 'Integration' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'demo', label: 'Live Demo' }
  ];

  const codeExamples = {
    basic: `import { createIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

// Create SDK configuration
const config = createSimpleConfig(
  'your-client-id',
  'https://your-app.com/callback',
  { 
    scopes: ['openid', 'profile', 'email'],
    storage: 'localStorage',
    autoRefresh: true 
  }
);

// Initialize SDK
const sdk = createIdentitySDK(config);

// Start authentication
await sdk.authenticate('identity-protocol');`,

    react: `import { useIdentitySDK, createSimpleConfig } from '@identity-protocol/identity-sdk';

function MyApp() {
  const config = createSimpleConfig(
    'your-client-id',
    'https://your-app.com/callback'
  );

  const {
    session,
    isAuthenticated,
    isLoading,
    error,
    authenticate,
    logout
  } = useIdentitySDK(config);

  if (isAuthenticated) {
    return (
      <div>
        <p>Welcome, {session?.identity.displayName}!</p>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return (
    <button onClick={() => authenticate('identity-protocol')}>
      Sign in with Identity Protocol
    </button>
  );
}`,

    compliance: `// Request additional data collection
const complianceData = await sdk.requestDataCollection({
  platform: 'your-platform',
  fields: {
    phone: {
      required: true,
      type: 'phone',
      description: 'Phone number for account verification'
    },
    address: {
      required: false,
      type: 'text',
      description: 'Billing address'
    },
    terms: {
      required: true,
      type: 'checkbox',
      description: 'I agree to the terms and conditions'
    }
  },
  consentText: 'I consent to the collection and processing of my data',
  dataUsage: 'This data will be used for account verification and compliance purposes'
});`
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Cross-Platform Identity SDK
          </h1>
          <p className="text-gray-600">
            Integrate secure, privacy-preserving identity authentication into any platform
          </p>
        </div>

        {/* Status Messages */}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
            {success}
          </div>
        )}
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  What is the Identity Protocol SDK?
                </h2>
                <div className="prose max-w-none">
                  <p className="text-gray-600 mb-4">
                    The Identity Protocol SDK provides OAuth-like authentication that can be adopted by any platform. 
                    Unlike traditional OAuth providers, users own their identities and control their data.
                  </p>
                  
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Key Features</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• <strong>Universal Authentication:</strong> Works with any platform that adopts the protocol</li>
                    <li>• <strong>User-Owned:</strong> Users control their identity and data</li>
                    <li>• <strong>Compliance Ready:</strong> Built-in support for additional data collection</li>
                    <li>• <strong>Standards-Based:</strong> Leverages existing web standards and metadata</li>
                    <li>• <strong>Lightweight:</strong> Minimal overhead, fast startup times</li>
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    For Users
                  </h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Single identity across all platforms</li>
                    <li>• Control over data sharing</li>
                    <li>• Portable identity</li>
                    <li>• Privacy-first approach</li>
                  </ul>
                </div>

                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    For Developers
                  </h3>
                  <ul className="space-y-2 text-gray-600">
                    <li>• Plug-and-play integration</li>
                    <li>• OAuth-like API</li>
                    <li>• Compliance data collection</li>
                    <li>• Cross-platform compatibility</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'integration' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Quick Integration
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">1. Install the SDK</h3>
                    <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-x-auto">
                      <code>npm install @identity-protocol/identity-sdk</code>
                    </pre>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">2. Basic Integration</h3>
                    <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-x-auto">
                      <code>{codeExamples.basic}</code>
                    </pre>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">3. React Integration</h3>
                    <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-x-auto">
                      <code>{codeExamples.react}</code>
                    </pre>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Configuration Options
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Storage Options</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• localStorage (default)</li>
                      <li>• sessionStorage</li>
                      <li>• indexedDB</li>
                      <li>• memory</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Scopes</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• openid</li>
                      <li>• profile</li>
                      <li>• email</li>
                      <li>• custom scopes</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Compliance Data Collection
                </h2>
                <p className="text-gray-600 mb-4">
                  Third-party platforms can request additional data from users for compliance purposes. 
                  Users maintain control over what they share.
                </p>

                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-3">Implementation</h3>
                  <pre className="bg-gray-100 p-4 rounded-md text-sm overflow-x-auto">
                    <code>{codeExamples.compliance}</code>
                  </pre>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">Best Practices</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Only request data you actually need</li>
                    <li>• Clearly explain why you need the data</li>
                    <li>• Provide clear consent options</li>
                    <li>• Allow users to decline optional fields</li>
                    <li>• Follow data protection regulations</li>
                  </ul>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Demo: Compliance Data Collection
                </h3>
                <ComplianceDataCollection
                  platform="Demo Platform"
                  fields={[
                    {
                      key: 'phone',
                      label: 'Phone Number',
                      type: 'phone',
                      required: true,
                      description: 'For account verification and security'
                    },
                    {
                      key: 'address',
                      label: 'Address',
                      type: 'textarea',
                      required: false,
                      description: 'For billing and shipping purposes'
                    },
                    {
                      key: 'newsletter',
                      label: 'Marketing Communications',
                      type: 'checkbox',
                      required: false,
                      description: 'Receive updates about new features'
                    }
                  ]}
                  consentText="I consent to the collection and processing of my data for account verification and service provision purposes."
                  dataUsage="This data will be used for account verification, billing, and to provide you with the best possible service experience."
                  onSubmit={() => {
                    // Handle compliance data submission
                    // In production, this would send data to the compliance service
                    setSuccess('Compliance data submitted successfully!');
                    setTimeout(() => setSuccess(null), 3000);
                  }}
                  onCancel={() => {
                    setError('Data collection was cancelled');
                    setTimeout(() => setError(null), 3000);
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'demo' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Live Demo
                </h2>
                <p className="text-gray-600 mb-6">
                  Try the cross-platform authentication flow below. This demonstrates how any platform 
                  can integrate with the Identity Protocol.
                </p>
                
                <CrossPlatformAuth
                  onAuthSuccess={() => {
                    // Handle successful authentication
                    // In production, this would update the session state
                    setSuccess('Authentication successful!');
                    setTimeout(() => setSuccess(null), 3000);
                  }}
                  onAuthError={(error) => {
                    // Handle authentication errors
                    // In production, this would log to monitoring service
                    setError(`Authentication failed: ${error.message}`);
                    setTimeout(() => setError(null), 5000);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}; 