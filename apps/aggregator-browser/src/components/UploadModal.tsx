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
}

export function UploadModal({ onClose, onUploadComplete }: UploadModalProps) {
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
      {/* FileStorageAggregator Component */}
      <div className="flex-1 overflow-y-auto p-6">
        <FileStorageAggregator authenticatedUser={authenticatedUser} hideSecureFolderSection={true} />
      </div>
    </div>
  );
}
