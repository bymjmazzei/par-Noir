import React, { useState } from 'react';

interface PWAInstallProps {
  pwaState: {
    isInstallable: boolean;
    isInstalled: boolean;
    isInstalling: boolean;
    deferredPrompt: any;
  };
  onInstall?: () => Promise<void>;
  onCheckUpdate?: () => Promise<void>;
  onExport?: () => Promise<void>;
}

export const PWAInstall: React.FC<PWAInstallProps> = ({ 
  pwaState, 
  onInstall,
  onExport
}) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleInstallClick = async () => {
    if (onInstall) {
      try {
        await onInstall();
      } catch (error) {
        // Handle installation error silently
      }
    }
  };

  const handleExportClick = async () => {
    setIsExporting(true);
    try {
      if (onExport) {
        await onExport();
      }
    } catch (error) {
      // Handle export error silently
    } finally {
      setIsExporting(false);
    }
  };

  // If it's a PWA (installed), show export button
  if (pwaState.isInstalled) {
    return (
      <button
        onClick={handleExportClick}
        disabled={isExporting}
        className="pwa-button"
        title="Export Data"
      >
        {isExporting ? 'Exporting...' : 'Export'}
      </button>
    );
  }

  // If it's a webapp, show install button
  return (
    <button
      onClick={handleInstallClick}
      disabled={pwaState.isInstalling}
      className="pwa-button"
      title="Install App"
    >
      {pwaState.isInstalling ? 'Installing...' : 'Install'}
    </button>
  );
};

export default PWAInstall; 