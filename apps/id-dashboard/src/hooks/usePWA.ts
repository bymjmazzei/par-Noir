import { useState, useEffect, useCallback } from 'react';

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  isInstalling: boolean;
  deferredPrompt: any;
  serviceWorkerRegistration: ServiceWorkerRegistration | null;
  storageStats: {
    totalSize: number;
    itemCount: number;
    identitiesCount: number;
    lastBackup: number | null;
  } | null;
}

interface PWAHandlers {
  install: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  clearCache: () => Promise<void>;
  exportData: () => Promise<string>;
  importData: (data: string) => Promise<void>;
  getStorageStats: () => Promise<void>;
}

export const usePWA = (): [PWAState, PWAHandlers] => {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isOnline: navigator.onLine,
    isInstalling: false,
    deferredPrompt: null,
    serviceWorkerRegistration: null,
    storageStats: null
  });

  // Check if app is installed
  const checkIfInstalled = useCallback(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInApp = (window.navigator as any).standalone === true;
    setState(prev => ({ ...prev, isInstalled: isStandalone || isInApp }));
  }, []);

  // Handle beforeinstallprompt event
  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault();
    setState(prev => ({
      ...prev,
      deferredPrompt: e,
      isInstallable: true
    }));
  }, []);

  // Handle appinstalled event
  const handleAppInstalled = useCallback(() => {
    setState(prev => ({
      ...prev,
      isInstalled: true,
      isInstallable: false,
      deferredPrompt: null
    }));
  }, []);

  // Handle online/offline events
  const handleOnline = useCallback(() => {
    setState(prev => ({ ...prev, isOnline: true }));
  }, []);

  const handleOffline = useCallback(() => {
    setState(prev => ({ ...prev, isOnline: false }));
  }, []);

  // Install the PWA
  const install = useCallback(async () => {
    // Silently handle PWA installation in production
    if (process.env.NODE_ENV === 'development') {
      // Development logging only
    }
    
    if (!state.deferredPrompt) {
      // Silently handle deferred prompt availability in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      
      // Try to force the install prompt by triggering the beforeinstallprompt event
      try {
        // Create a synthetic beforeinstallprompt event
        const syntheticEvent = new Event('beforeinstallprompt');
        window.dispatchEvent(syntheticEvent);
        
        // Wait a moment and try again
        setTimeout(async () => {
          if (state.deferredPrompt) {
            try {
              await state.deferredPrompt.prompt();
              await state.deferredPrompt.userChoice;
              // Silently handle install outcome in production
              if (process.env.NODE_ENV === 'development') {
                // Development logging only
              }
            } catch (error) {
              // Silently handle install failures in production
              if (process.env.NODE_ENV === 'development') {
                // Development logging only
              }
              alert('Install failed. Please try the manual installation methods.');
            }
          } else {
            // If still no prompt, show manual instructions
            alert('Please install manually:\n\nChrome: Look for 📱 icon in address bar\nSafari: Share → Add to Home Screen\nFirefox: ⋮ menu → Install App');
          }
        }, 100);
        
        return;
              } catch (error) {
          // Silently handle force install prompt failures in production
          if (process.env.NODE_ENV === 'development') {
            // Development logging only
          }
        }
      
      alert('Please install manually:\n\nChrome: Look for 📱 icon in address bar\nSafari: Share → Add to Home Screen\nFirefox: ⋮ menu → Install App');
      return;
    }

    setState(prev => ({ ...prev, isInstalling: true }));

    try {
      await state.deferredPrompt.prompt();
      const { outcome } = await state.deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        // Silently handle user acceptance in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
        setState(prev => ({
          ...prev,
          isInstalled: true,
          isInstallable: false,
          deferredPrompt: null
        }));
      } else {
        // Silently handle user dismissal in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      }
    } catch (error) {
      // Silently handle installation errors in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      alert('Install failed. Please try again or install manually from your browser menu.');
    } finally {
      setState(prev => ({ ...prev, isInstalling: false }));
    }
  }, [state.deferredPrompt]);

  // Check for service worker updates
  const checkForUpdates = useCallback(async () => {
    if ('serviceWorker' in navigator && state.serviceWorkerRegistration) {
      try {
        await state.serviceWorkerRegistration.update();
        // Silently handle service worker updates in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      } catch (error) {
        // Silently handle service worker update failures in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      }
    }
  }, [state.serviceWorkerRegistration]);

  // Clear cache
  const clearCache = useCallback(async () => {
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        // Silently handle cache clearing in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      } catch (error) {
        // Silently handle cache clearing failures in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
      }
    }
  }, []);

  // Export data
  const exportData = useCallback(async (): Promise<string> => {
    try {
      // Import the secureStorage dynamically to avoid circular dependencies
      const { secureStorage } = await import('../utils/localStorage');
      return await secureStorage.exportData();
    } catch (error) {
      // Silently handle data export failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      throw error;
    }
  }, []);

  // Import data
  const importData = useCallback(async (data: string) => {
    try {
      const { secureStorage } = await import('../utils/localStorage');
      await secureStorage.importData(data);
      // Silently handle data import success in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    } catch (error) {
      // Silently handle data import failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
      throw error;
    }
  }, []);

  // Get storage statistics
  const getStorageStats = useCallback(async () => {
    try {
      const { secureStorage } = await import('../utils/localStorage');
      const stats = await secureStorage.getStorageStats();
      setState(prev => ({ ...prev, storageStats: stats }));
    } catch (error) {
      // Silently handle storage stats failures in production
      if (process.env.NODE_ENV === 'development') {
        // Development logging only
      }
    }
  }, []);

  // Initialize PWA features
  useEffect(() => {
    // Check initial state
    checkIfInstalled();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          setState(prev => ({ ...prev, serviceWorkerRegistration: registration }));

          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available
                  if (confirm('A new version is available. Reload to update?')) {
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch(() => {
          // Silently handle service worker registration failures in production
          if (process.env.NODE_ENV === 'development') {
            // Development logging only
          }
        });
    }

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Get initial storage stats
    getStorageStats();

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkIfInstalled, handleBeforeInstallPrompt, handleAppInstalled, handleOnline, handleOffline, getStorageStats]);

  // Listen for service worker messages
  useEffect(() => {
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SYNC_IDENTITY_DATA') {
        // Silently handle identity data sync in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
        // Handle identity data sync
      } else if (event.data && event.data.type === 'SYNC_RECOVERY_DATA') {
        // Silently handle recovery data sync in production
        if (process.env.NODE_ENV === 'development') {
          // Development logging only
        }
        // Handle recovery data sync
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  const handlers: PWAHandlers = {
    install,
    checkForUpdates,
    clearCache,
    exportData,
    importData,
    getStorageStats
  };

  return [state, handlers];
};

export default usePWA; 