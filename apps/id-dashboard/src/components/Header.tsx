import React, { useState } from 'react';
import { OfflineModeToggle } from './OfflineModeToggle';
import { ThemeSwitcher } from './ThemeSwitcher';
import { PWAInstall } from './PWAInstall';
import NotificationsButton from './NotificationsButton';
import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  authenticatedUser: any;
  onLogout: () => void;
  onOfflineModeChange: (offline: boolean) => void;
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
}

const Header: React.FC<HeaderProps> = ({ authenticatedUser, onLogout, onOfflineModeChange, pwaState, onPWAInstall, onPWACheckUpdate, onExport, onPasscodeLogout, onPinRefresh }) => {
  const [isPWA, setIsPWA] = useState(false);

  // Check if running as PWA
  React.useEffect(() => {
    const checkPWA = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isInstalled = (window.navigator as any).standalone === true;
      setIsPWA(isStandalone || isInstalled);
    };
    
    checkPWA();
    window.addEventListener('resize', checkPWA);
    return () => window.removeEventListener('resize', checkPWA);
  }, []);

  return (
    <>
      <header className="fixed top-0 left-0 w-full z-40 text-text-primary border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <ThemeSwitcher />
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Notifications Button - Only when authenticated */}
            {authenticatedUser && (
              <NotificationsButton isPWA={isPWA} />
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
                className="px-3 py-1 text-sm border border-border rounded hover:bg-hover transition-colors"
                title="Lock Identity"
              >
                Lock
              </button>
            )}
            
            {/* Passcode Logout Button - For PWA with passcode system */}
            {isPWA && authenticatedUser && onPasscodeLogout && (
              <button
                onClick={onPasscodeLogout}
                className="px-3 py-1 text-sm border border-border rounded hover:bg-hover transition-colors"
                title="Return to Passcode Screen"
              >
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