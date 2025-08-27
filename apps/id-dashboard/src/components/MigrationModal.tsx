import React, { useState } from 'react';
import { RefreshCw, CheckCircle, XCircle, Info } from 'lucide-react';
import { MigrationManager, WebIdentityData, MigrationResult } from '../utils/migration';

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingIdentities: WebIdentityData[];
  onMigrationComplete: (result: MigrationResult) => void;
}

export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onClose,
  pendingIdentities,
  onMigrationComplete
}) => {
  const [step, setStep] = useState<'prompt' | 'migrating' | 'complete'>('prompt');
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [selectedIdentities, setSelectedIdentities] = useState<string[]>(
    pendingIdentities.map(id => id.id)
  );

  const handleMigrate = async () => {
    setStep('migrating');
    
    try {
      const identitiesToMigrate = pendingIdentities.filter(id => 
        selectedIdentities.includes(id.id)
      );
      
      const result = await MigrationManager.migrateIdentities(identitiesToMigrate);
      setMigrationResult(result);
      setStep('complete');
      
      // Clean up web storage if all migrations were successful
      if (result.success && result.errors.length === 0) {
        MigrationManager.clearWebStorage();
      }
      
      onMigrationComplete(result);
    } catch (error) {
      setMigrationResult({
        success: false,
        migratedCount: 0,
        errors: [`Migration failed: ${error}`],
        skippedCount: 0
      });
      setStep('complete');
    }
  };

  const handleSkip = () => {
    onClose();
  };

  const handleClose = () => {
    if (migrationResult?.success) {
      // Reload the page to refresh the app state after successful migration
      window.location.reload();
    } else {
      onClose();
    }
  };

  const toggleIdentitySelection = (identityId: string) => {
    setSelectedIdentities(prev => 
      prev.includes(identityId)
        ? prev.filter(id => id !== identityId)
        : [...prev, identityId]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-modal-bg rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-text-primary">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-8 h-8 text-blue-500" />
            <div>
              <h2 className="text-2xl font-bold">Identity Migration</h2>
              <p className="text-text-secondary">
                {step === 'prompt' && 'Migrate your identities to PWA storage'}
                {step === 'migrating' && 'Migrating your identities...'}
                {step === 'complete' && 'Migration complete'}
              </p>
            </div>
          </div>
          {step !== 'migrating' && (
            <button
              onClick={handleClose}
              className="text-text-secondary hover:text-text-primary"
            >
              ✕
            </button>
          )}
        </div>

        {/* Step: Prompt */}
        {step === 'prompt' && (
          <div className="space-y-6">
            {/* Explanation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <Info className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">We found PNs to migrate!</h3>
                  <p className="text-blue-800 text-sm">
                    You created {pendingIdentities.length} pN(s) in your browser before installing the PWA. 
                    We can securely migrate them to your PWA&apos;s encrypted storage for better security and offline access.
                  </p>
                </div>
              </div>
            </div>

            {/* Identity Selection */}
            <div>
              <h4 className="font-medium text-text-primary mb-3">Select PNs to migrate:</h4>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {pendingIdentities.map((identity) => (
                  <div key={identity.id} className="border border-border rounded-lg p-3">
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        id={identity.id}
                        checked={selectedIdentities.includes(identity.id)}
                        onChange={() => toggleIdentitySelection(identity.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <label htmlFor={identity.id} className="cursor-pointer">
                          <div className="font-medium text-text-primary">
                            {(identity.data as any).username || 'Unknown'}
                          </div>
                          <div className="text-sm text-text-secondary">
                            {(identity.data as any).nickname && (
                              <span>&quot;{(identity.data as any).nickname}&quot; • </span>
                            )}
                            Created {formatDate(identity.createdAt)}
                          </div>
                          {identity.migrationAttempts && identity.migrationAttempts > 0 && (
                            <div className="text-xs text-yellow-600 mt-1">
                              Previous migration attempts: {identity.migrationAttempts}
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Migration Benefits */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-900 mb-2">Migration Benefits:</h4>
              <div className="text-sm text-green-800 space-y-1">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Enhanced security with AES-256 encryption</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Persistent storage that survives browser cache clearing</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Full offline functionality</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Automatic backup and recovery features</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-3">
              <button
                onClick={handleSkip}
                className="flex-1 px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-secondary transition-colors"
              >
                Skip for Now
              </button>
              <button
                onClick={handleMigrate}
                disabled={selectedIdentities.length === 0}
                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Migrate {selectedIdentities.length} pN(s)
              </button>
            </div>
          </div>
        )}

        {/* Step: Migrating */}
        {step === 'migrating' && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
            </div>
            <div>
              <h3 className="text-lg font-medium mb-2">Migrating Your PNs</h3>
              <p className="text-text-secondary">
                                  Securely transferring {selectedIdentities.length} pN(s) to PWA storage...
              </p>
              <p className="text-sm text-text-secondary mt-2">
                This may take a few moments. Please don&apos;t close this window.
              </p>
            </div>
          </div>
        )}

        {/* Step: Complete */}
        {step === 'complete' && migrationResult && (
          <div className="space-y-6">
            {/* Results Summary */}
            <div className={`border rounded-lg p-4 ${
              migrationResult.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center space-x-2 mb-3">
                {migrationResult.success ? (
                  <CheckCircle className="w-8 h-8 text-green-500" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-500" />
                )}
                <h3 className={`font-medium ${
                  migrationResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {migrationResult.success ? 'Migration Successful!' : 'Migration Issues'}
                </h3>
              </div>
              
              <div className={`text-sm space-y-1 ${
                migrationResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {migrationResult.migratedCount > 0 && (
                  <p className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Successfully migrated {migrationResult.migratedCount} identity(ies)
                  </p>
                )}
                {migrationResult.skippedCount > 0 && (
                  <p>⏭️ Skipped {migrationResult.skippedCount} identity(ies) (already migrated)</p>
                )}
                {migrationResult.errors.length > 0 && (
                  <div>
                    <p>❌ {migrationResult.errors.length} error(s) occurred:</p>
                    <ul className="list-disc list-inside ml-4 mt-1">
                      {migrationResult.errors.map((error, index) => (
                        <li key={index} className="text-xs">{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Next Steps */}
            {migrationResult.success && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">What&apos;s Next?</h4>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• Your identities are now securely stored in PWA storage</p>
                  <p>• You can access them offline and they&apos;re encrypted with AES-256</p>
                  <p>• The app will refresh to load your migrated identities</p>
                  <p>• You can create backups from the Export tab</p>
                </div>
              </div>
            )}

            {/* Action */}
            <div className="flex justify-center">
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                {migrationResult.success ? 'Continue to Dashboard' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};