import React from 'react';
import { FileStorageAggregator } from '../../../../../id-dashboard/src/components/storage/FileStorageAggregator';

export const AppMain: React.FC = () => {
  return (
    <div className="min-h-screen theme-dark bg-bg-primary text-text-primary">
      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <FileStorageAggregator />
      </main>
    </div>
  );
};

export default AppMain;

