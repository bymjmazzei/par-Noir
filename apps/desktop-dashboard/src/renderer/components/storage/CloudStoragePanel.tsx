import React from 'react';
import { FileStorageAggregator } from 'par-noir-dashboard/FileStorageAggregator';

interface CloudStoragePanelProps {
  authenticatedUser?: any;
}

/**
 * Desktop wrapper around the production FileStorageAggregator that powers the
 * web dashboard. Reuses the dashboard package export so the desktop app stays
 * in lock-step without deep-importing another app's src tree.
 */
export const CloudStoragePanel: React.FC<CloudStoragePanelProps> = ({
  authenticatedUser,
}) => {
  return (
    <div className="min-h-[70vh]">
      <FileStorageAggregator authenticatedUser={authenticatedUser ?? undefined} />
    </div>
  );
};

export default CloudStoragePanel;
