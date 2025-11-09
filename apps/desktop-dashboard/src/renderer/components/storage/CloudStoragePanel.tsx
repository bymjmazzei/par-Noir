import React from 'react';
import { FileStorageAggregator } from '../../../../../id-dashboard/src/components/storage/FileStorageAggregator';

interface CloudStoragePanelProps {
  authenticatedUser?: any;
}

/**
 * Desktop wrapper around the production FileStorageAggregator that powers the
 * web dashboard.  We deliberately reuse the upstream component so the desktop
 * app stays in lock-step with the browser experience (token persistence,
 * Google Drive multi-account support, metadata editing, etc).
 *
 * The wrapper only handles optional authenticated user plumbing – the
 * aggregator can still derive identity data from SecureStorage when the prop
 * is omitted (which mirrors the web unlock flow).
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

