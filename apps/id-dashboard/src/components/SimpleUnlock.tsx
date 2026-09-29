import React from 'react';
import { HostedShellLaunch } from '@par-noir/oauth-ui';

interface SimpleUnlockProps {
  onUnlock: (file: File, passcode: string) => Promise<void>;
  onCancel: () => void;
}

/** Factor entry lives in the unlock binary. This shell only receives a session. */
export const SimpleUnlock: React.FC<SimpleUnlockProps> = ({ onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Unlock pN File</h2>
        <HostedShellLaunch op="session" onSession={() => undefined} />
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
