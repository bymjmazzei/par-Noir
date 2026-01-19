/**
 * Upload page - UploadModal in a full-screen layout.
 */

import React from 'react';
import { UploadModal } from '../components/UploadModal';
import { Feed } from '../types/aggregator';

export interface UploadPageProps {
  feeds: Feed[];
  onClose: () => void;
  onUploadComplete: () => void;
}

export function UploadPage({ feeds, onClose, onUploadComplete }: UploadPageProps) {
  return (
    <div className="h-screen w-full bg-neutral-900" style={{ paddingBottom: '64px' }}>
      <UploadModal feeds={feeds} onClose={onClose} onUploadComplete={onUploadComplete} />
    </div>
  );
}
