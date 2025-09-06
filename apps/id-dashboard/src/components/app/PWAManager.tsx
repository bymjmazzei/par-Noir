import React, { useState, useEffect, useCallback } from 'react';
import usePWA from '../../hooks/usePWA';
import { useCleanupManager } from "../../utils/cleanupManager";

interface PWAManagerProps {
  onInstall: () => void;
  onUpdate: () => void;
}

export const PWAManager: React.FC<PWAManagerProps> = ({
  onInstall,
  onUpdate
}) => {
  const [pwaState, pwaHandlers] = usePWA();
  const [isPWALocked, setIsPWALocked] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  
  const cleanupManager = useCleanupManager();

  // Handle PWA install prompt
  const handleInstall = useCallback(async () => {
    try {
      await pwaHandlers.install();
      setShowInstallPrompt(false);
      onInstall();
    } catch (error) {
      // Console statement removed for production
    }
  }, [pwaHandlers, onInstall]);

  // Handle PWA update
  const handleUpdate = useCallback(async () => {
    try {
      await pwaHandlers.update();
      onUpdate();
    } catch (error) {
      // Console statement removed for production
    }
  }, [pwaHandlers, onUpdate]);

  // Handle PWA lock/unlock
  const handlePWALock = useCallback(() => {
    setIsPWALocked(true);
  }, []);

  const handlePWAUnlock = useCallback(() => {
    setIsPWALocked(false);
  }, []);

  // Show install prompt when available
  useEffect(() => {
    if (pwaState.canInstall && !pwaState.isInstalled) {
      setShowInstallPrompt(true);
    }
  }, [pwaState.canInstall, pwaState.isInstalled]);

  // Add cleanup for any timers or listeners
  useEffect(() => {
    return () => {
      cleanupManager.cleanupAll();
    };
  }, [cleanupManager]);

  if (isPWALocked) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <h2 className="text-xl font-semibold mb-4">PWA Locked</h2>
          <p className="text-gray-600 mb-6">
            This PWA is currently locked. Please unlock to continue.
          </p>
          <button
            onClick={handlePWAUnlock}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PWA Status */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-3">PWA Status</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Installed:</span>
            <span className={pwaState.isInstalled ? 'text-green-600' : 'text-red-600'}>
              {pwaState.isInstalled ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Can Install:</span>
            <span className={pwaState.canInstall ? 'text-green-600' : 'text-red-600'}>
              {pwaState.canInstall ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Update Available:</span>
            <span className={pwaState.updateAvailable ? 'text-yellow-600' : 'text-gray-600'}>
              {pwaState.updateAvailable ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      </div>

      {/* PWA Actions */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-3">PWA Actions</h3>
        <div className="space-y-3">
          {showInstallPrompt && (
            <button
              onClick={handleInstall}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Install PWA
            </button>
          )}

          {pwaState.updateAvailable && (
            <button
              onClick={handleUpdate}
              className="w-full px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
            >
              Update PWA
            </button>
          )}

          <button
            onClick={handlePWALock}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Lock PWA
          </button>
        </div>
      </div>

      {/* PWA Features */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-semibold mb-3">PWA Features</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="offline-mode"
              checked={pwaState.offlineMode}
              onChange={() => {/* Toggle offline mode */}}
              className="rounded"
            />
            <label htmlFor="offline-mode">Offline Mode</label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="background-sync"
              checked={pwaState.backgroundSync}
              onChange={() => {/* Toggle background sync */}}
              className="rounded"
            />
            <label htmlFor="background-sync">Background Sync</label>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="push-notifications"
              checked={pwaState.pushNotifications}
              onChange={() => {/* Toggle push notifications */}}
              className="rounded"
            />
            <label htmlFor="push-notifications">Push Notifications</label>
          </div>
        </div>
      </div>
    </div>
  );
};
