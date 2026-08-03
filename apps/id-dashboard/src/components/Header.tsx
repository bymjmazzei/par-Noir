import React, { useState } from 'react';
import { OfflineModeToggle } from './OfflineModeToggle';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PWAInstall } from './PWAInstall';
import NotificationsButton from './NotificationsButton';
import { RefreshCw } from 'lucide-react';
import { LockIcon } from '@par-noir/oauth-ui';

interface HeaderProps {
  authenticatedUser: any;
  onLogout: () => void;
  onOfflineModeChange: (offline: boolean) => void;
  /** When false, show a compact offline hint (identity unlock / local data still work). */
  isOnline?: boolean;
  pwaState?: {
    isInstallable: boolean;
    isInstalled: boolean;
    isInstalling: boolean;
    deferredPrompt: any;
  };
  onPWAInstall?: () => Promise<void>;
  onPWACheckUpdate?: () => Promise<void>;
  onExport?: () => Promise<void>;
  onPasscodeLogout?: () => Promise<void>;
  onPinRefresh?: () => void;
  apiToken?: string | null;
  pnIdentifier?: string | null;
  isKeyedSession?: boolean;
  onOpenRecoveryForPairing?: () => void;
}

const Header: React.FC<HeaderProps> = ({ authenticatedUser, onLogout, onOfflineModeChange, isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true, pwaState, onPWAInstall, onPWACheckUpdate, onExport, onPasscodeLogout, onPinRefresh, apiToken = null, pnIdentifier = null, isKeyedSession = false, onOpenRecoveryForPairing }) => {
  const [isPWA, setIsPWA] = useState(false);

  // Check if running as PWA or native app (Capacitor) - hide Install in both
  React.useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInstalled = (window.navigator as any).standalone === true;
      const isCapacitor = typeof (window as any).Capacitor !== 'undefined';
      setIsPWA(isStandalone || isInstalled || isCapacitor);
    };

    checkPWA();
    window.addEventListener('resize', checkPWA);
    return () => window.removeEventListener('resize', checkPWA);
  }, []);

  return (
    <>
      <header
        className="fixed left-0 w-full z-40 text-text-primary"
        style={{ top: 'env(safe-area-inset-top, 0px)', background: 'transparent', border: 'none' }}
      >
        {!isOnline && (
          <div
            className="w-full text-center text-xs py-1.5 px-3 bg-amber-900/90 text-amber-100 border-b border-amber-700/50"
            role="status"
          >
            You’re offline. Identity unlock and local data still work; Google Drive and cloud sync need a connection.
          </div>
        )}
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <ThemeSwitcher />
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Notifications Button - Only when authenticated */}
            {authenticatedUser && (
              <NotificationsButton
                isPWA={isPWA}
                apiToken={apiToken}
                pnIdentifier={pnIdentifier}
                isKeyedSession={isKeyedSession}
                onOpenRecoveryForPairing={onOpenRecoveryForPairing}
              />
            )}
            
            {/* PWA Install Button - Only for web app */}
            {!isPWA && pwaState && (
              <PWAInstall 
                pwaState={pwaState}
                onInstall={onPWAInstall}
                onCheckUpdate={onPWACheckUpdate}
                onExport={onExport}
              />
            )}
            

            
            {/* Lock Button - Only for web app */}
            {!isPWA && authenticatedUser && (
              <button
                onClick={onLogout}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-hover transition-colors flex items-center gap-2"
                title="Lock Identity"
              >
                <LockIcon className="w-4 h-4" />
                Lock
              </button>
            )}
            
            {/* Passcode Logout Button - For PWA with passcode system */}
            {isPWA && authenticatedUser && onPasscodeLogout && (
              <button
                onClick={onPasscodeLogout}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-hover transition-colors flex items-center gap-2"
                title="Return to Passcode Screen"
              >
                <LockIcon className="w-4 h-4" />
                Lock
              </button>
            )}
            
            {/* Refresh Button - Only for PWA login screen */}
            {isPWA && !authenticatedUser && onPinRefresh && (
              <button
                onClick={onPinRefresh}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-hover transition-colors flex items-center gap-2"
                title="Return to PIN Screen"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            )}
            
            {/* Online/Offline Toggle - Only for PWA, moved to right side */}
            {isPWA && (
              <OfflineModeToggle 
                onModeChange={onOfflineModeChange}
              />
            )}
          </div>
        </div>
      </header>


    </>
  );
};

export default Header;