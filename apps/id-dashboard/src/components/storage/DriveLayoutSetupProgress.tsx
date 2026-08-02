import React from 'react';
import type { DriveSetupProgress } from './FileStorageAggregatorTypes';

export function DriveLayoutSetupProgress({ progress }: { progress: DriveSetupProgress }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);
  const staleMs = progress.updatedAt ? now - progress.updatedAt : 0;
  const showSlowHint = staleMs > 20_000;

  return (
    <div className="text-center py-12 px-4">
      <p className="text-text-primary font-medium mb-1">Setting up your storage</p>
      <p className="text-text-secondary text-sm mb-4">{progress.stepLabel}</p>
      <div className="w-full max-w-md mx-auto h-2.5 bg-neutral-800 rounded-full overflow-hidden relative overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-500 ease-out rounded-full relative"
          style={{ width: `${Math.max(4, progress.percent)}%` }}
        >
          {showSlowHint && (
            <div className="absolute inset-0 bg-blue-400/40 animate-pulse rounded-full" />
          )}
        </div>
      </div>
      <p className="text-text-secondary text-xs mt-2">{progress.percent}%</p>
      <p className="text-text-secondary text-xs mt-4 max-w-sm mx-auto">
        {showSlowHint
          ? 'Your cloud provider is responding slowly — setup is still running. This can take a few minutes.'
          : 'This usually takes a few minutes. Your files will appear when setup finishes.'}
      </p>
    </div>
  );
}
