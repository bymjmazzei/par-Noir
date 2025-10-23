// Google Drive Demo Component
// Showcases the demo functionality for video recording

import React, { useState } from 'react';
import { GoogleDriveStorage } from './GoogleDriveStorage';
import { Monitor, Smartphone, Play, Square, RotateCcw } from 'lucide-react';

export const GoogleDriveDemo: React.FC = () => {
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isRecording, setIsRecording] = useState(false);

  const handleStartRecording = () => {
    setIsRecording(true);
    // Simulate recording start
    console.log('Demo recording started');
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // Simulate recording stop
    console.log('Demo recording stopped');
  };

  const handleResetDemo = () => {
    // Reset demo state
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Demo Controls Header */}
      <div className="bg-secondary border-b border-border p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-text-primary">par Noir - Google Drive Integration Demo</h1>
            <div className="flex items-center space-x-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">
              <Play className="h-4 w-4 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">DEMO MODE</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2 bg-gray-800 border border-gray-600 rounded-lg p-1">
              <button
                onClick={() => setViewMode('desktop')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'desktop' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title="Desktop View"
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`p-2 rounded transition-colors ${
                  viewMode === 'mobile' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                title="Mobile View"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>

            {/* Recording Controls */}
            <div className="flex items-center space-x-2">
              {!isRecording ? (
                <button
                  onClick={handleStartRecording}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Play className="h-4 w-4" />
                  <span>Start Recording</span>
                </button>
              ) : (
                <button
                  onClick={handleStopRecording}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Square className="h-4 w-4" />
                  <span>Stop Recording</span>
                </button>
              )}
              
              <button
                onClick={handleResetDemo}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className="bg-red-500 text-white text-center py-2">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
            <span className="font-medium">RECORDING DEMO</span>
            <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`max-w-7xl mx-auto p-6 ${viewMode === 'mobile' ? 'max-w-sm' : ''}`}>
        {/* Demo Instructions */}
        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-300 mb-2">Demo Instructions</h2>
          <ol className="list-decimal list-inside space-y-1 text-blue-200 text-sm">
            <li>Click "Start Demo Connection" to simulate Google Drive authentication</li>
            <li>Browse demo files showcasing decentralized identity-based encryption</li>
            <li>Upload any file type to see AES-256-GCM encryption in action</li>
            <li>Download files to see client-side decryption process</li>
            <li>Notice how files are encrypted in Google Drive - only user can access</li>
            <li>See our custom preview system for encrypted content</li>
            <li>Experience secure file management with decentralized identity protocol</li>
            <li>Use demo controls to reset and explore security features</li>
          </ol>
        </div>

        {/* Google Drive Component */}
        <div className={viewMode === 'mobile' ? 'max-w-sm mx-auto' : ''}>
          <GoogleDriveStorage />
        </div>

        {/* Demo Features Showcase */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">🔐 Decentralized Identity Encryption</h3>
            <p className="text-gray-300 text-sm">
              All user files are encrypted with AES-256-GCM using decentralized identity protocol. Only the user with their DID can decrypt their content.
            </p>
          </div>
          
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">🛡️ Zero-Knowledge Architecture</h3>
            <p className="text-gray-300 text-sm">
              File decryption happens on the user's device using their decentralized identity (DID). No server, including Google Drive, can access user content.
            </p>
          </div>
          
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-4">
            <h3 className="font-semibold text-white mb-2">📱 Custom Preview System</h3>
            <p className="text-gray-300 text-sm">
              Since files are AES-256-GCM encrypted, we provide our own preview functionality. Google Drive only sees encrypted content.
            </p>
          </div>
        </div>

        {/* Security Features */}
        <div className="mt-8 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-lg p-6">
          <h3 className="font-semibold text-blue-300 mb-4">🔐 Security Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-white">Encryption & Privacy:</h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">🔐</span>
                  <span>AES-256-GCM encryption for all user files</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">🛡️</span>
                  <span>Decentralized identity (DID) based encryption</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">🔒</span>
                  <span>Zero-knowledge: no server can access content</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">🔑</span>
                  <span>Only user with their DID can decrypt files</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium text-white">Google Drive Integration:</h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex items-start space-x-2">
                  <span className="text-green-400">✅</span>
                  <span>OAuth 2.0 authentication</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-400">✅</span>
                  <span>Follows all API guidelines</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-400">✅</span>
                  <span>Secure token handling</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-green-400">✅</span>
                  <span>Enhances Google Drive with decentralized identity security</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* File Operations Demo */}
        <div className="mt-8 bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-lg p-6">
          <h3 className="font-semibold text-blue-300 mb-4">📁 File Operations Demo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-white">How Encrypted Files Work:</h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">1.</span>
                  <span>Files encrypted with AES-256-GCM before upload to Google Drive</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">2.</span>
                  <span>Google Drive stores encrypted content only - can't read files</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">3.</span>
                  <span>Download and decrypt on user's device using their DID</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="text-blue-400">4.</span>
                  <span>Custom preview system for encrypted content</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium text-white">Security Benefits:</h4>
              <div className="bg-gray-900 border border-gray-600 rounded p-3 text-xs font-mono text-gray-300">
                <div className="text-green-400">// AES-256-GCM encrypted file in Google Drive</div>
                <div className="text-blue-400">File:</div> <span>"encrypted_content.bin"</span>
                <div className="mt-2 text-green-400">// User's DID decrypts locally</div>
                <div className="text-blue-400">Decrypt:</div> <span>user_DID → readable_content</span>
                <div className="mt-2 text-green-400">// Preview without server access</div>
                <div className="text-blue-400">Preview:</div> <span>client_side_only</span>
                <div className="mt-2 text-green-400">// Zero-knowledge architecture</div>
                <div className="text-blue-400">Security:</div> <span>decentralized_identity</span>
              </div>
            </div>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-8 bg-gray-800 border border-gray-600 rounded-lg p-4">
          <h3 className="font-semibold text-white mb-2">Technical Implementation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div>
              <h4 className="font-medium mb-1 text-white">Google Drive API Integration:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>OAuth 2.0 authentication</li>
                <li>Secure token handling</li>
                <li>Follows all API guidelines</li>
                <li>Standard file operations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1 text-white">Encryption & Security:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>AES-256-GCM encryption</li>
                <li>Decentralized identity (DID) based</li>
                <li>Zero-knowledge architecture</li>
                <li>Custom preview system</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-600">
            <h4 className="font-medium mb-2 text-white">API Compliance & Security:</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
              <div>
                <h5 className="font-medium mb-1 text-green-400">Google Drive API Compliance:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li>Follows OAuth 2.0 standards</li>
                  <li>Implements proper error handling</li>
                  <li>Respects rate limits</li>
                  <li>Uses official SDKs</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium mb-1 text-blue-400">Enhanced Security Features:</h5>
                <ul className="list-disc list-inside space-y-1">
                  <li>AES-256-GCM encryption</li>
                  <li>Decentralized identity protocol</li>
                  <li>Zero-knowledge architecture</li>
                  <li>DID-based key management</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
