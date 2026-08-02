import React from 'react';
import type { ImportFormState } from '../hooks/useAppState';

export interface ImportDidModalProps {
  showImportForm: boolean;
  setShowImportForm: React.Dispatch<React.SetStateAction<boolean>>;
  importForm: ImportFormState;
  setImportForm: React.Dispatch<React.SetStateAction<ImportFormState>>;
  loading: boolean;
  handleImportDID: (e: React.FormEvent) => void | Promise<void>;
}

export function ImportDidModal(props: ImportDidModalProps) {
  const {
    showImportForm,
    setShowImportForm,
    importForm,
    setImportForm,
    loading,
    handleImportDID
  } = props;

  return (
    <>
        {/* Import DID Modal */}
        {showImportForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto p-4 sm:p-6">
            <div className="bg-modal-bg rounded-lg p-6 max-w-md w-full mx-4 my-8 max-h-[90vh] overflow-y-auto text-text-primary">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-semibold">Unlock pN</h2>
                  <button 
                  onClick={() => setShowImportForm(false)}
                  className="modal-close-button"
                >
                  ×
                  </button>
                </div>
              <form onSubmit={handleImportDID} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Identity File
                  </label>
                  <input
                    type="file"
                    accept=".pn,.id,.json,.identity"
                    onChange={(e) => setImportForm(prev => ({ ...prev, backupFile: e.target.files?.[0] || null }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Upload your identity file (.pn, .id, .json, or .identity) to unlock your identity
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    pN Name
                  </label>
                  <input
                    type="text"
                    value={importForm.pnName}
                    onChange={(e) => setImportForm(prev => ({ ...prev, pnName: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter your pN Name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={importForm.passcode}
                    onChange={(e) => setImportForm(prev => ({ ...prev, passcode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg text-text-primary rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter passcode"
                    required
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    {loading ? 'Unlocking...' : 'Unlock pN'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportForm(false)}
                    className="flex-1 px-4 py-2 modal-button rounded-md"
                  >
                    Cancel
                  </button>
                </div>
              </form>
                      </div>
                    </div>
                  )}
    </>
  );
}
