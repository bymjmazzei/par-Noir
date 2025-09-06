import React, { useState, useCallback, useMemo } from 'react';
import { CheckCircle, Edit3, Trash2, Plus, User, Shield, Lock } from 'lucide-react';
import { DIDInfo, RecoveryCustodian } from '../types/identity';
import { IdentitySelector } from './IdentitySelector';
import { OnboardingWizard } from './OnboardingWizard';
import { MigrationModal } from './MigrationModal';
import { ProfilePictureEditor } from './ProfilePictureEditor';
import { BiometricSetup } from './BiometricSetup';

interface IdentityManagerProps {
  identities: DIDInfo[];
  selectedIdentity: DIDInfo | null;
  onIdentitySelect: (identity: DIDInfo) => void;
  onIdentityCreate: (identity: DIDInfo) => void;
  onIdentityUpdate: (id: string, updates: Partial<DIDInfo>) => void;
  onIdentityDelete: (id: string) => void;
  onIdentityImport: (file: File) => Promise<void>;
  onIdentityExport: (identity: DIDInfo) => void;
  onRecoverySetup: (identityId: string, custodians: RecoveryCustodian[]) => void;
  onBiometricSetup: (identityId: string, enabled: boolean) => void;
}

export const IdentityManager: React.FC<IdentityManagerProps> = React.memo(({
  identities,
  selectedIdentity,
  onIdentitySelect,
  onIdentityCreate,
  onIdentityUpdate,
  onIdentityDelete,
  onIdentityImport,
  onIdentityExport,
  onRecoverySetup,
  onBiometricSetup
}) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMigration, setShowMigration] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<DIDInfo | null>(null);

  const handleCreateIdentity = useCallback(async () => {
    setShowOnboarding(true);
  }, []);

  const handleImportIdentity = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await onIdentityImport(file);
      } catch (error) {
        // Console statement removed for production
      }
    }
  }, [onIdentityImport]);

  const handleEditIdentity = useCallback((identity: DIDInfo) => {
    setEditingIdentity(identity);
    setShowProfileEditor(true);
  }, []);

  const handleDeleteIdentity = useCallback((identity: DIDInfo) => {
    if (window.confirm(`Are you sure you want to delete ${identity.pnName}? This action cannot be undone.`)) {
      onIdentityDelete(identity.id);
    }
  }, [onIdentityDelete]);

  const handleExportIdentity = useCallback((identity: DIDInfo) => {
    onIdentityExport(identity);
  }, [onIdentityExport]);

  const handleRecoverySetup = useCallback((identity: DIDInfo) => {
    // This would open a recovery setup modal
    // Console statement removed for production
  }, []);

  const handleBiometricToggle = useCallback((identity: DIDInfo) => {
    setShowBiometricSetup(true);
  }, []);

  const memoizedIdentities = useMemo(() => identities, [identities]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Identity Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your decentralized identities
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleCreateIdentity}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Identity
          </button>
          
          <label className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
            <input
              type="file"
              accept=".json,.txt"
              onChange={handleImportIdentity}
              className="hidden"
            />
            Import
          </label>
        </div>
      </div>

      {/* Identity List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {memoizedIdentities.map((identity) => (
          <div
            key={identity.id}
            className={`p-6 rounded-lg border-2 transition-all cursor-pointer ${
              selectedIdentity?.id === identity.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            onClick={() => onIdentitySelect(identity)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {identity.displayName || identity.pnName}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {identity.pnName}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-1">
                {identity.status === 'active' && (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                {identity.isEncrypted && (
                  <Lock className="w-4 h-4 text-blue-500" />
                )}
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {identity.email && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📧 {identity.email}
                </p>
              )}
              {identity.phone && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📱 {identity.phone}
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Created: {new Date(identity.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditIdentity(identity);
                  }}
                  className="p-2 text-gray-500 hover:text-blue-600 transition-colors"
                  title="Edit Identity"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRecoverySetup(identity);
                  }}
                  className="p-2 text-gray-500 hover:text-green-600 transition-colors"
                  title="Recovery Setup"
                >
                  <Shield className="w-4 h-4" />
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBiometricToggle(identity);
                  }}
                  className="p-2 text-gray-500 hover:text-purple-600 transition-colors"
                  title="Biometric Setup"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExportIdentity(identity);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  Export
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteIdentity(identity);
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                  title="Delete Identity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {memoizedIdentities.length === 0 && (
        <div className="text-center py-12">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No identities yet
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Create your first decentralized identity to get started
          </p>
          <button
            onClick={handleCreateIdentity}
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Your First Identity
          </button>
        </div>
      )}

      {/* Modals */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={(identity) => {
            onIdentityCreate(identity);
            setShowOnboarding(false);
          }}
          onCancel={() => setShowOnboarding(false)}
        />
      )}

      {showMigration && (
        <MigrationModal
          onComplete={() => setShowMigration(false)}
          onCancel={() => setShowMigration(false)}
        />
      )}

      {showProfileEditor && editingIdentity && (
        <ProfilePictureEditor
          identity={editingIdentity}
          onSave={(updates) => {
            onIdentityUpdate(editingIdentity.id, updates);
            setShowProfileEditor(false);
            setEditingIdentity(null);
          }}
          onCancel={() => {
            setShowProfileEditor(false);
            setEditingIdentity(null);
          }}
        />
      )}

      {showBiometricSetup && selectedIdentity && (
        <BiometricSetup
          identity={selectedIdentity}
          onComplete={(enabled) => {
            onBiometricSetup(selectedIdentity.id, enabled);
            setShowBiometricSetup(false);
          }}
          onCancel={() => setShowBiometricSetup(false)}
        />
      )}
    </div>
  );
});

IdentityManager.displayName = 'IdentityManager';
