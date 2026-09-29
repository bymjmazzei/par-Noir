import React from 'react';
import { HostedShellLaunch } from '@par-noir/oauth-ui';

export interface CreateDidForm {
  pnName: string;
  confirmPNName: string;
  passcode: string;
  confirmPasscode: string;
  nickname: string;
  email: string;
  phone: string;
  recoveryEmail: string;
  confirmRecoveryEmail: string;
  recoveryPhone: string;
  confirmRecoveryPhone: string;
  recoveryContactType: 'email' | 'phone';
}

export interface CreateDidModalProps {
  showCreateForm: boolean;
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>;
  createStep: number;
  setCreateStep: React.Dispatch<React.SetStateAction<number>>;
  createForm: CreateDidForm;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateDidForm>>;
  showPNName: boolean;
  setShowPNName: React.Dispatch<React.SetStateAction<boolean>>;
  showPasscode: boolean;
  setShowPasscode: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPNName: boolean;
  setShowConfirmPNName: React.Dispatch<React.SetStateAction<boolean>>;
  showConfirmPasscode: boolean;
  setShowConfirmPasscode: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  handleCreateDID: (e: React.FormEvent) => void | Promise<void>;
}

export function CreateDidModal(props: CreateDidModalProps) {
  const { showCreateForm, setShowCreateForm } = props;
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
            const file = session.result?.identityFile;
            if (file) {
              const blob = new Blob([file], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'par-noir-identity.json';
              a.click();
              URL.revokeObjectURL(url);
            }
            setShowCreateForm(false);
          }}
        />
      </div>
    </div>
  );
}
