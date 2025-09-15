import React, { useState, useEffect, useCallback } from 'react';
import { AuthenticationManager } from './components/app/AuthenticationManager';
import { IdentityManagement } from './components/app/IdentityManagement';
import { MainDashboard } from './components/app/MainDashboard';
import { PWAManager } from './components/app/PWAManager';
import { useCleanupManager } from './utils/cleanupManager';
import { SecureStorage } from './utils/storage';
import { logger } from './utils/logger';
import { DIDInfo, EncryptedIdentity } from './types/dashboard';
import { AuthSession } from './utils/crypto';

// Main App component - now much smaller and focused
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(null);
  const [dids, setDids] = useState<DIDInfo[]>([]);
  const [selectedDID, setSelectedDID] = useState<DIDInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const cleanupManager = useCleanupManager();
  const storage = new SecureStorage();

  // Initialize app on mount
  useEffect(() => {
    initializeApp();
    
    // Cleanup on unmount
    return () => {
      cleanupManager.cleanupAll();
    };
  }, [cleanupManager]);

  const initializeApp = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check for existing session
      const session = await storage.getCurrentSession();
      if (session) {
        setCurrentSession(session);
        setIsAuthenticated(true);
        
        // Load identities for authenticated user
        await loadIdentities();
      }
    } catch (error) {
      logger.error('Failed to initialize app:', error);
      setError('Failed to initialize application');
    } finally {
      setLoading(false);
    }
  }, [storage]);

  const loadIdentities = useCallback(async () => {
    try {
      const storedIdentities = await storage.getAllIdentities();
      setDids(storedIdentities);
      
      if (storedIdentities.length > 0 && !selectedDID) {
        setSelectedDID(storedIdentities[0]);
      }
    } catch (error) {
      logger.error('Failed to load identities:', error);
    }
  }, [storage, selectedDID]);

  // Authentication handlers
  const handleAuthenticationChange = useCallback((session: AuthSession | null) => {
    setIsAuthenticated(!!session);
    setCurrentSession(session);
    
    if (session) {
      loadIdentities();
    } else {
      setDids([]);
      setSelectedDID(null);
    }
  }, [loadIdentities]);

  const handleIdentityUnlock = useCallback((identity: EncryptedIdentity) => {
    // Handle identity unlock logic
    logger.info('Identity unlocked:', identity.id);
  }, []);

  // Identity management handlers
  const handleIdentitySelect = useCallback((identity: DIDInfo) => {
    setSelectedDID(identity);
  }, []);

  const handleIdentityCreate = useCallback((identity: DIDInfo) => {
    setDids(prev => [...prev, identity]);
    setSelectedDID(identity);
  }, []);

  const handleIdentityUpdate = useCallback((identity: DIDInfo) => {
    setDids(prev => prev.map(id => id.id === identity.id ? identity : id));
    if (selectedDID?.id === identity.id) {
      setSelectedDID(identity);
    }
  }, [selectedDID]);

  const handleIdentityDelete = useCallback((identityId: string) => {
    setDids(prev => prev.filter(id => id.id !== identityId));
    if (selectedDID?.id === identityId) {
      const remainingIdentities = dids.filter(id => id.id !== identityId);
      setSelectedDID(remainingIdentities.length > 0 ? remainingIdentities[0] : null);
    }
  }, [selectedDID, dids]);

  // PWA handlers
  const handlePWAInstall = useCallback(() => {
    logger.info('PWA installed successfully');
  }, []);

  const handlePWAUpdate = useCallback(() => {
    logger.info('PWA updated successfully');
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Initialization Error</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={initializeApp}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthenticationManager
        onAuthenticationChange={handleAuthenticationChange}
        onIdentityUnlock={handleIdentityUnlock}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with PWA Manager */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">par Noir</h1>
            <div className="flex items-center space-x-4">
              <PWAManager
                onInstall={handlePWAInstall}
                onUpdate={handlePWAUpdate}
              />
              <button
                onClick={() => handleAuthenticationChange(null)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Identity Management Sidebar */}
          <div className="lg:col-span-1">
            <IdentityManagement
              onIdentitySelect={handleIdentitySelect}
              onIdentityCreate={handleIdentityCreate}
              onIdentityUpdate={handleIdentityUpdate}
              onIdentityDelete={handleIdentityDelete}
            />
          </div>

          {/* Main Dashboard */}
          <div className="lg:col-span-3">
            <MainDashboard
              dids={dids}
              selectedDID={selectedDID}
              onDIDSelect={handleIdentitySelect}
              onDIDCreate={handleIdentityCreate}
              onDIDUpdate={handleIdentityUpdate}
              onDIDDelete={handleIdentityDelete}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
