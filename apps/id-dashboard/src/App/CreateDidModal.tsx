import React from 'react';
import { HostedShellLaunch, type HostedShellSession } from '@par-noir/oauth-ui';

export interface CreateDidModalProps {
  showCreateForm: boolean;
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  onCreateSession: (session: HostedShellSession) => void;
}

export function CreateDidModal(props: CreateDidModalProps) {
  const { showCreateForm, setShowCreateForm, onCreateSession } = props;
  if (!showCreateForm) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 text-text-primary">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold">Create New pN</h2>
          <button type="button" onClick={() => setShowCreateForm(false)} className="text-text-secondary">
            Close
          </button>
        </div>
        <HostedShellLaunch
          op="create"
          label="Create in par Noir Unlock"
          onSession={(session) => {
            onCreateSession(session);
            setShowCreateForm(false);
          }}
        />
      </div>
    </div>
  );
}
