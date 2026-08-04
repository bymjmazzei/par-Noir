import React from 'react';
import { SectionInfo } from '../common/SectionInfo';

interface RecoveryKeyGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  recoveryKeyForm: {
    purpose: 'personal' | 'legal' | 'insurance' | 'will';
    description: string;
  };
  setRecoveryKeyForm: React.Dispatch<React.SetStateAction<{
    purpose: 'personal' | 'legal' | 'insurance' | 'will';
    description: string;
  }>>;
  onGenerateRecoveryKey: (purpose: 'personal' | 'legal' | 'insurance' | 'will', description: string) => void;
}

export function RecoveryKeyGenerationModal({
  isOpen,
  onClose,
  recoveryKeyForm,
  setRecoveryKeyForm,
  onGenerateRecoveryKey
}: RecoveryKeyGenerationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
      <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Generate Recovery Key</h2>
            <SectionInfo title="Generate Recovery Key">
              <p>
                Recovery keys trigger the custodian approval process. They do not directly unlock your
                identity. Store them securely and consider providing copies to trusted individuals or
                legal entities.
              </p>
            </SectionInfo>
          </div>
          <button
            onClick={onClose}
            className="modal-close-button"
          >
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Purpose
            </label>
            <select
              value={recoveryKeyForm.purpose}
              onChange={(e) => setRecoveryKeyForm(prev => ({ ...prev, purpose: e.target.value as 'personal' | 'legal' | 'insurance' | 'will' }))}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="personal">Personal Backup</option>
              <option value="legal">Legal/Will</option>
              <option value="insurance">Insurance</option>
              <option value="will">Estate Planning</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={recoveryKeyForm.description}
              onChange={(e) => setRecoveryKeyForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g., Safe deposit box, Lawyer's office"
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => onGenerateRecoveryKey(recoveryKeyForm.purpose, recoveryKeyForm.description)}
              className="flex-1 px-4 py-2 modal-button rounded-md font-medium"
            >
              Generate Key
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-secondary text-text-primary rounded-md hover:bg-hover font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
