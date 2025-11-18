/**
 * Upload Modal Component
 * Uses the dashboard's FileStorageAggregator component directly
 */

import React from 'react';
import { FileStorageAggregator } from './FileStorageAggregator';
import { useUserState } from '../contexts/UserStateContext';

interface UploadModalProps {
  onClose: () => void;
  onUploadComplete?: () => void;
  onBrowseCloudClick?: () => void;
}

export function UploadModal({ onClose, onUploadComplete, onBrowseCloudClick }: UploadModalProps) {
  const { userState } = useUserState();
  
  // Convert browser app's userState to dashboard's authenticatedUser format
  const authenticatedUser = userState.isUnlocked && userState.pnIdentifier ? {
    id: userState.pnIdentifier,
    pnName: userState.pnName,
    publicKey: userState.publicKey,
    nickname: userState.nickname,
    accessToken: userState.accessToken
  } : null;

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col overflow-y-auto" style={{ paddingBottom: '64px' }}>
      {/* Header with Railway Toggle */}
      <div className="border-b border-neutral-700 sticky top-0 bg-neutral-900 z-10">
        <div className="flex items-center justify-between p-6">
          <h2 className="text-xl font-bold text-white">Storage</h2>
        </div>
        {/* Railway Navigation */}
        <div className="flex items-center space-x-1 px-6 pb-3 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => {}}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              true
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            Upload
          </button>
          <button
            onClick={onBrowseCloudClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              false
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            Browse Cloud
          </button>
        </div>
      </div>

      {/* FileStorageAggregator Component */}
      <div className="flex-1 overflow-y-auto p-6">
        <FileStorageAggregator authenticatedUser={authenticatedUser} hideSecureFolderSection={true} />
      </div>
    </div>
  );
}
