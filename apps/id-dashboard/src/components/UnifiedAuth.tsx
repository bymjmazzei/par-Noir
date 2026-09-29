import React from 'react';
import { HostedShellLaunch } from '@par-noir/oauth-ui';

interface UnifiedAuthProps {
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: Error) => void;
  onCreateId?: () => void;
  onImportId?: () => void;
}

export const UnifiedAuth: React.FC<UnifiedAuthProps> = ({
  onAuthSuccess,
  onAuthError,
  onCreateId,
  onImportId
}) => {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
        <p className="text-gray-600">Sign in to your identity</p>
      </div>

      <HostedShellLaunch
        op="session"
        onSession={(session) => {
          onAuthSuccess?.({
            id: session.did,
            publicKey: session.publicKey,
            accessToken: session.accessToken || session.code,
            nickname: session.nickname,
          });
        }}
      />

      <div className="mt-6 text-center">
        <p className="text-sm text-theme-secondary mb-4">Don&apos;t have an identity?</p>
        <div className="space-y-2">
          <button
            onClick={onCreateId}
            className="w-full modal-button py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Create New Identity
          </button>
          <button
            onClick={onImportId}
            className="w-full modal-button py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Import Identity
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedAuth; 