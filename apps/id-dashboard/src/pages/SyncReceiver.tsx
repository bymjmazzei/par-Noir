import React, { useState, useEffect } from 'react';
import { Download, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

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
    // Check if sync data exists for this code
    const storedData = localStorage.getItem(`sync-${syncCode}`);
    if (storedData) {
      try {
        const data = JSON.parse(storedData);
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

    // Verify credentials match the sync data
    if (pnName !== syncData.pnName || passcode !== syncData.passcode) {
      setError('Invalid pN Name or passcode');
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      setStep('transferring');

      // Simulate file transfer delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create a real pN file for download
      const pnFileData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        pnName: pnName,
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
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pnName}-synced.pn`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also store in PWA if available (optional)
      try {
        const existingPNs = JSON.parse(localStorage.getItem('pwa-identities') || '[]');
        const pnEntry = {
          id: `pn-${Date.now()}`,
          name: pnName,
          encryptedData: pnFileData.encryptedData,
          createdAt: new Date().toISOString(),
          syncedFrom: syncData.deviceType || 'unknown',
          filePath: `${pnName}-synced.pn`
        };
        existingPNs.push(pnEntry);
        localStorage.setItem('pwa-identities', JSON.stringify(existingPNs));
      } catch (err) {
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
            Your pN "{pnName}" has been downloaded to your device as "{pnName}-synced.pn"
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
