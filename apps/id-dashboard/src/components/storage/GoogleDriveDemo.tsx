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
            <div className="flex items-center space-x-2 bg-background rounded-lg p-1">
              <button
                onClick={() => setViewMode('desktop')}
                className={`p-2 rounded ${viewMode === 'desktop' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}
                title="Desktop View"
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`p-2 rounded ${viewMode === 'mobile' ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}
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
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
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
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Demo Instructions</h2>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 text-sm">
            <li>Click "Start Demo Connection" to simulate Google Drive authentication</li>
            <li>Browse the demo files (Identity documents, certificates, etc.)</li>
            <li>Upload a new file to see the upload progress simulation</li>
            <li>Download files to see the demo download functionality</li>
            <li>Delete files to demonstrate file management</li>
            <li>Use the demo controls to reset the demo state</li>
          </ol>
        </div>

        {/* Google Drive Component */}
        <div className={viewMode === 'mobile' ? 'max-w-sm mx-auto' : ''}>
          <GoogleDriveStorage />
        </div>

        {/* Demo Features Showcase */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-secondary/50 border border-border rounded-lg p-4">
            <h3 className="font-semibold text-text-primary mb-2">🔐 Secure Authentication</h3>
            <p className="text-text-secondary text-sm">
              Demonstrates OAuth 2.0 flow with Google Drive API, including token management and user profile access.
            </p>
          </div>
          
          <div className="bg-secondary/50 border border-border rounded-lg p-4">
            <h3 className="font-semibold text-text-primary mb-2">📁 File Management</h3>
            <p className="text-text-secondary text-sm">
              Complete CRUD operations: create, read, update, and delete files with real-time progress indicators.
            </p>
          </div>
          
          <div className="bg-secondary/50 border border-border rounded-lg p-4">
            <h3 className="font-semibold text-text-primary mb-2">⚡ Real-time Updates</h3>
            <p className="text-text-secondary text-sm">
              Live file synchronization with progress tracking, error handling, and responsive UI updates.
            </p>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Technical Implementation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <h4 className="font-medium mb-1">APIs Used:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Google Drive API v3</li>
                <li>Google OAuth 2.0</li>
                <li>File Upload/Download</li>
                <li>Metadata Management</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium mb-1">Key Features:</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Secure token-based authentication</li>
                <li>Real-time file operations</li>
                <li>Progress tracking for uploads</li>
                <li>Error handling and recovery</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
