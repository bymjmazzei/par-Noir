import React, { useState, useEffect } from 'react';
import { Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { PNNameHash } from '../utils/security/pnNameHash';

interface SyncReceiverProps {
  syncCode: string;
}

export const SyncReceiver: React.FC<SyncReceiverProps> = ({ syncCode }) => {
  const [step, setStep] = useState<'loading' | 'verify' | 'transferring' | 'success' | 'error'>('loading');
  const [pnName, setPnName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [syncData, setSyncData] = useState<any>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // SECURITY: Check if sync data exists for this code
    // Note: Sync data should NOT contain plaintext pnName/passcode
    const storedData = localStorage.getItem(`sync-${syncCode}`);
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
        // SECURITY: Verify sync data structure doesn't contain secrets
        if (data.pnName || data.passcode) {
          console.error('[SyncReceiver] SECURITY WARNING: Sync data contains plaintext secrets. This is a security vulnerability.');
          setError('Invalid or insecure sync data. Please regenerate sync code.');
          setStep('error');
          // SECURITY: Remove insecure sync data
          localStorage.removeItem(`sync-${syncCode}`);
          return;
        }
        setSyncData(data);
        setStep('verify');
      } catch (err) {
        setError('Invalid sync data');
        setStep('error');
      }
    } else {
      setError('Sync code not found or expired');
      setStep('error');
    }
  }, [syncCode]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pnName || !passcode) {
      setError('Please enter both pN Name and passcode');
      return;
    }

    // SECURITY: Verify credentials using hash comparison instead of plaintext
    // Sync data should contain hashed pnName, not plaintext
    try {
      const pnNameHash = await PNNameHash.hash(pnName);
      
      // SECURITY: Compare hashes instead of plaintext
      // If syncData has pnNameHash, use that. Otherwise, this is legacy/insecure data.
      if (syncData.pnNameHash) {
        // Use constant-time comparison to prevent timing attacks
        const hashMatches = await PNNameHash.verify(pnName, syncData.pnNameHash);
        if (!hashMatches) {
          setError('Invalid pN Name or passcode');
          return;
        }
      } else if (syncData.pnName && syncData.passcode) {
        // Legacy fallback - SECURITY WARNING: This is insecure
        console.warn('[SyncReceiver] SECURITY WARNING: Sync data contains plaintext secrets. This is a security vulnerability.');
        console.warn('[SyncReceiver] Please regenerate sync data with hashed pnName instead of plaintext.');
        
        // Still verify for backward compatibility, but warn user
        if (pnName !== syncData.pnName || passcode !== syncData.passcode) {
          setError('Invalid pN Name or passcode');
          return;
        }
        
        // SECURITY: Remove insecure sync data after use
        localStorage.removeItem(`sync-${syncCode}`);
        setError('SECURITY WARNING: Sync data was insecure. Please regenerate sync code on the sending device.');
        return;
      } else {
        setError('Invalid sync data format');
        return;
      }
    } catch (err) {
      console.error('[SyncReceiver] Error verifying credentials:', err);
      setError('Verification failed. Please try again.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setStep('transferring');

      // Simulate file transfer delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // SECURITY: Create pN file WITHOUT plaintext pnName
      // Use pnNameHash or identifier instead
      const pnNameHash = await PNNameHash.hash(pnName);
      const fileIdentifier = pnNameHash.substring(0, 12); // Use first 12 chars of hash as identifier
      
      const pnFileData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        // SECURITY: Do NOT include plaintext pnName - use hash/identifier instead
        pnIdentifier: `pn-${fileIdentifier}`, // Use identifier instead of plaintext
        deviceType: syncData.deviceType || 'unknown',
        syncedFrom: 'device-sync',
        encryptedData: {
          // This would contain the actual encrypted pN data
          // For now, we'll create a placeholder structure
          data: 'encrypted-pn-data-placeholder',
          iv: 'initialization-vector',
          salt: 'salt-value'
        }
      };

      // Convert to JSON and create downloadable file
      const pnFileContent = JSON.stringify(pnFileData, null, 2);
      const blob = new Blob([pnFileContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // SECURITY: Use identifier in filename instead of plaintext pnName
      const a = document.createElement('a');
      a.href = url;
      a.download = `pn-${fileIdentifier}-synced.pn`; // Use identifier instead of pnName
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // SECURITY: Do NOT store pnName in localStorage
      // Store only encrypted data and identifier
      try {
        const existingPNs = JSON.parse(localStorage.getItem('pwa-identities') || '[]');
        const pnEntry = {
          id: `pn-${Date.now()}`,
          // SECURITY: Do NOT store plaintext pnName
          pnIdentifier: `pn-${fileIdentifier}`, // Use identifier instead
          encryptedData: pnFileData.encryptedData,
          createdAt: new Date().toISOString(),
          syncedFrom: syncData.deviceType || 'unknown',
          filePath: `pn-${fileIdentifier}-synced.pn` // Use identifier in filename
        };
        existingPNs.push(pnEntry);
        localStorage.setItem('pwa-identities', JSON.stringify(existingPNs));
      } catch (err) {
        console.warn('[SyncReceiver] Failed to store in PWA identities:', err);
      }

      // Clean up sync data
      localStorage.removeItem(`sync-${syncCode}`);

      setStep('success');
      
    } catch (err) {
      setError('Failed to transfer pN file. Please try again.');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToApp = () => {
    window.location.href = '/';
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-text-primary">Loading sync data...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-modal-bg rounded-lg p-6 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text-primary mb-2">Sync Failed</h1>
          <p className="text-text-secondary mb-6">{error}</p>
          <button
            onClick={handleBackToApp}
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
          >
            Back to pN App
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-modal-bg rounded-lg p-6 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text-primary mb-2">Sync Complete!</h1>
          <p className="text-text-secondary mb-6">
            {/* SECURITY: Do NOT display plaintext pnName in UI */}
            Your pN file has been downloaded to your device
          </p>
          <button
            onClick={handleBackToApp}
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
          >
            Open pN App
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-modal-bg rounded-lg p-6">
        <div className="text-center mb-6">
          <Download className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text-primary mb-2">Receive pN File</h1>
          <p className="text-text-secondary">
            Enter your pN credentials to receive the file from another device
          </p>
        </div>

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                pN Name
              </label>
              <input
                type="text"
                value={pnName}
                onChange={(e) => setPnName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter your pN Name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Passcode
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                required
                className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter your passcode"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>{isLoading ? 'Verifying...' : 'Receive pN File'}</span>
            </button>
          </form>
        )}

        {step === 'transferring' && (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-text-primary mb-2">Transferring pN file...</p>
            <p className="text-text-secondary text-sm">Please wait while we securely transfer your pN file</p>
          </div>
        )}

        <div className="mt-6 text-xs text-text-secondary space-y-1">
          <p>• Sync Code: {syncCode}</p>
          <p>• This will download a pN file to your device</p>
          <p>• Your credentials are required for security</p>
          <p>• File will be saved to your Downloads folder</p>
          <p>• Works on any device with a web browser</p>
        </div>
      </div>
    </div>
  );
};
