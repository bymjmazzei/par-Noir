import React from 'react';

interface HeaderProps {
  authenticatedUser: any;
  onLogout: () => void;
  onOfflineModeChange: (offline: boolean) => void;
  pwaState?: {
    isInstallable?: boolean;
    isInstalled?: boolean;
    isInstalling?: boolean;
  };
  onPWAInstall?: () => Promise<void>;
  onPWACheckUpdate?: () => Promise<void>;
  onExport?: () => Promise<void>;
}

const Header: React.FC<HeaderProps> = ({
  authenticatedUser,
  onLogout,
  onOfflineModeChange,
  onExport,
  pwaState,
  onPWAInstall,
  onPWACheckUpdate,
}) => {
  const handleOfflineToggle = React.useCallback(() => {
    onOfflineModeChange(true);
    setTimeout(() => onOfflineModeChange(false), 100);
  }, [onOfflineModeChange]);

  return (
    <header className="border-b border-border bg-bg-primary/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-text-secondary">par Noir</p>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">Secure Desktop Control Center</h1>
          {authenticatedUser ? (
            <p className="text-xs text-text-tertiary mt-1">
              Signed in as {authenticatedUser.pnName ?? authenticatedUser.nickname ?? 'identity'}
            </p>
          ) : (
            <p className="text-xs text-text-tertiary mt-1">
              Unlock your pN to manage encrypted storage providers.
            </p>
          )}
          </div>
          
        <div className="flex flex-wrap items-center gap-3">
          {pwaState?.isInstallable && onPWAInstall && (
              <button
              type="button"
              onClick={onPWAInstall}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-primary hover:bg-bg-elevated/70"
              >
              INSTALL PWA
              </button>
            )}
            
          {onPWACheckUpdate && (
              <button
              type="button"
              onClick={onPWACheckUpdate}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-primary hover:bg-bg-elevated/70"
              >
              CHECK UPDATES
              </button>
            )}
            
          <button
            type="button"
            onClick={handleOfflineToggle}
            className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-primary hover:bg-bg-elevated/70"
          >
            OFFLINE MODE
          </button>

          {onExport && (
              <button
              type="button"
              onClick={onExport}
              className="rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-primary hover:bg-bg-elevated/70"
              >
              EXPORT DATA
              </button>
            )}
            
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-wide text-black hover:bg-accent/90"
          >
            LOCK
          </button>
          </div>
        </div>
      </header>
  );
};

export default Header;