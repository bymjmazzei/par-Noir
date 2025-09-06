import React, { useState, useEffect } from 'react';
import { MainDashboard } from './components/app/MainDashboard';
import { UnifiedAuth } from './components/UnifiedAuth';
import { Logo } from './components/Logo';
import { DIDInfo } from './components/types/dashboard';
import { SecureStorage } from './utils/storage';
import { IdentityCrypto, AuthSession, EncryptedIdentity } from './utils/crypto';
import { InputValidator } from './utils/validation';

// Simple storage for demo purposes
const storage = new SecureStorage();

interface CreateForm {
  pnName: string;
  passcode: string;
  confirmPasscode: string;
  recoveryEmail: string;
  recoveryPhone: string;
}

interface ImportForm {
  pnName: string;
  passcode: string;
  uploadFile: File | null;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthSession | null>(null);
  const [dids, setDids] = useState<DIDInfo[]>([]);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    pnName: '',
    passcode: '',
    confirmPasscode: '',
    recoveryEmail: '',
    recoveryPhone: ''
  });
  const [importForm, setImportForm] = useState<ImportForm>({
    pnName: '',
    passcode: '',
    uploadFile: null
  });

  // Initialize storage
  useEffect(() => {
    const initStorage = async () => {
      try {
        await storage.init();
      } catch (error) {
        // Storage initialization failed - error handled by UI
      }
    };
    initStorage();
  }, []);

  const handleCreateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate form
      if (createForm.passcode !== createForm.confirmPasscode) {
        setError('Passcodes do not match');
        return;
      }

      const pnNameValidation = InputValidator.validatePNName(createForm.pnName);
      if (!pnNameValidation.isValid) {
        setError(`pN Name validation failed: ${pnNameValidation.errors.join(', ')}`);
        return;
      }

      const passcodeValidation = InputValidator.validatePasscode(createForm.passcode);
      if (!passcodeValidation.isValid) {
        setError(`Passcode validation failed: ${passcodeValidation.errors.join(', ')}`);
        return;
      }

      // Create identity
      const encryptedIdentity = await IdentityCrypto.createIdentity(
        createForm.pnName,
        createForm.passcode,
        {
          recoveryEmail: createForm.recoveryEmail || undefined,
          recoveryPhone: createForm.recoveryPhone || undefined
        }
      );

      // Create DID info
      const didInfo: DIDInfo = {
        id: encryptedIdentity.publicKey,
        pnName: createForm.pnName,
        createdAt: new Date().toISOString(),
        status: 'active',
        displayName: createForm.pnName,
        nickname: createForm.pnName
      };

      // Store identity
      await storage.storeIdentity(encryptedIdentity, createForm.pnName);

      // Update state
      setDids(prev => [...prev, didInfo]);
      setSelectedDID(didInfo);

      // Authenticate user
      const authSession = await IdentityCrypto.authenticateIdentity(
        encryptedIdentity,
        createForm.passcode,
        createForm.pnName
      );
      setAuthenticatedUser(authSession);
      setIsAuthenticated(true);

      setSuccess('Identity created successfully!');
      setCreateForm({
        pnName: '',
        passcode: '',
        confirmPasscode: '',
        recoveryEmail: '',
        recoveryPhone: ''
      });
      setShowCreateForm(false);

    } catch (error) {
      // Create identity error - handled by UI
      setError('Failed to create identity. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleImportIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!importForm.uploadFile) {
        setError('Please select a file to import');
        return;
      }

      // Read file
      const fileContent = await importForm.uploadFile.text();
      const identityData = JSON.parse(fileContent);

      // Validate and extract identity
      let encryptedIdentity: EncryptedIdentity;
      if (identityData.identities && Array.isArray(identityData.identities)) {
        if (identityData.identities.length === 1) {
          encryptedIdentity = identityData.identities[0];
        } else {
          throw new Error('Invalid pN file: Multiple identities found');
        }
      } else if (identityData.publicKey && identityData.encryptedData) {
        encryptedIdentity = identityData;
      } else {
        throw new Error('Invalid pN file format');
      }

      // Authenticate
      const authSession = await IdentityCrypto.authenticateIdentity(
        encryptedIdentity,
        importForm.passcode,
        importForm.pnName
      );

      // Create DID info
      const didInfo: DIDInfo = {
        id: encryptedIdentity.publicKey,
        pnName: importForm.pnName,
        createdAt: new Date().toISOString(),
        status: 'active',
        displayName: importForm.pnName,
        nickname: importForm.pnName
      };

      // Update state
      setDids(prev => [...prev, didInfo]);
      setSelectedDID(didInfo);
      setAuthenticatedUser(authSession);
      setIsAuthenticated(true);

      setSuccess('Identity imported successfully!');
      setImportForm({
        pnName: '',
        passcode: '',
        uploadFile: null
      });
      setShowImportForm(false);

    } catch (error) {
      // Import identity error - handled by UI
      setError('Failed to import identity. Please check your file and passcode.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthenticatedUser(null);
    setIsAuthenticated(false);
    setDids([]);
    setSelectedDID(null);
    setError(null);
    setSuccess(null);
  };

  const handleIdentitySelect = (did: DIDInfo) => {
    setSelectedDID(did);
  };

  const handleIdentityCreate = (did: DIDInfo) => {
    setDids(prev => [...prev, did]);
    setSelectedDID(did);
  };

  const handleIdentityUpdate = (updatedDID: DIDInfo) => {
    setDids(prev => prev.map(did => did.id === updatedDID.id ? updatedDID : did));
    if (selectedDID?.id === updatedDID.id) {
      setSelectedDID(updatedDID);
    }
  };

  const handleIdentityDelete = (didId: string) => {
    setDids(prev => prev.filter(did => did.id !== didId));
    if (selectedDID?.id === didId) {
      setSelectedDID(null);
    }
  };

  if (isAuthenticated && authenticatedUser) {
    return (
      <div className="min-h-screen bg-bg-primary text-text-primary">
        <MainDashboard
          dids={dids}
          selectedDID={selectedDID}
          onDIDSelect={handleIdentitySelect}
          onDIDCreate={handleIdentityCreate}
          onDIDUpdate={handleIdentityUpdate}
          onDIDDelete={handleIdentityDelete}
        />
        
        {/* Success/Error Messages */}
        {success && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
            {success}
            <button
              onClick={() => setSuccess(null)}
              className="ml-2 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        )}
        
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Header */}
      <div className="flex justify-center items-center mt-8 mb-8">
        <div className="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 lg:w-72 lg:h-72 xl:w-80 xl:h-80">
          <Logo />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          {!showCreateForm && !showImportForm && (
            <div className="bg-modal-bg rounded-lg shadow p-6">
              <h1 className="text-2xl font-bold text-center text-text-primary mb-2">par Noir</h1>
              <p className="text-center text-text-secondary mb-6">Digital Identity Management</p>
              
              <div className="space-y-4">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full px-4 py-3 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                >
                  Create New pN
                </button>
                
                <button
                  onClick={() => setShowImportForm(true)}
                  className="w-full px-4 py-3 bg-secondary text-text-primary rounded-md hover:bg-hover transition-colors"
                >
                  Import Existing pN
                </button>
              </div>
            </div>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="bg-modal-bg rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Create New pN</h2>
              
              <form onSubmit={handleCreateIdentity} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    pN Name
                  </label>
                  <input
                    type="text"
                    value={createForm.pnName}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, pnName: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Enter your pN name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={createForm.passcode}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, passcode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Enter a secure passcode"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Confirm Passcode
                  </label>
                  <input
                    type="password"
                    value={createForm.confirmPasscode}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPasscode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Confirm your passcode"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Recovery Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={createForm.recoveryEmail}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, recoveryEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Enter recovery email"
                  />
                </div>
                
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create pN'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Import Form */}
          {showImportForm && (
            <div className="bg-modal-bg rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-text-primary mb-4">Import Existing pN</h2>
              
              <form onSubmit={handleImportIdentity} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    pN Name
                  </label>
                  <input
                    type="text"
                    value={importForm.pnName}
                    onChange={(e) => setImportForm(prev => ({ ...prev, pnName: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Enter your pN name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    Passcode
                  </label>
                  <input
                    type="password"
                    value={importForm.passcode}
                    onChange={(e) => setImportForm(prev => ({ ...prev, passcode: e.target.value }))}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    placeholder="Enter your passcode"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">
                    pN File
                  </label>
                  <input
                    type="file"
                    accept=".pn,.id,.json,.identity"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImportForm(prev => ({ ...prev, uploadFile: file }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-input-border bg-input-bg rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-text-primary"
                    required
                  />
                </div>
                
                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Importing...' : 'Import pN'}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowImportForm(false)}
                    className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg">
          {success}
          <button
            onClick={() => setSuccess(null)}
            className="ml-2 text-white hover:text-gray-200"
          >
            ×
          </button>
        </div>
      )}
      
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-white hover:text-gray-200"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
