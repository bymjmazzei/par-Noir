import React, { useState } from 'react';
import { Download } from 'lucide-react';

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

// Detect if device is mobile
const isMobileDevice = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
};

export const PWAInstall: React.FC<PWAInstallProps> = ({ 
  pwaState, 
  onInstall,
  onExport
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isMobile = isMobileDevice();

  const handleInstallClick = async () => {
    // If mobile, install PWA
    if (isMobile) {
      if (onInstall) {
        try {
          await onInstall();
        } catch (error) {
          // Handle installation error silently
        }
      }
    } else {
      // If desktop, download desktop app
      await handleDesktopDownload();
    }
  };

  const handleDesktopDownload = async () => {
    setIsDownloading(true);
    try {
      // Fetch latest release from GitHub API
      const response = await fetch('https://api.github.com/repos/bymjmazzei/par-Noir/releases/latest');
      if (!response.ok) {
        throw new Error('Failed to fetch release info');
      }
      
      const release = await response.json();
      const assets = release.assets || [];
      
      // Detect platform
      const platform = navigator.platform.toLowerCase();
      let downloadUrl: string | null = null;
      
      // Find appropriate asset based on platform
      if (platform.includes('mac') || platform.includes('darwin')) {
        // macOS - look for DMG file
        const dmgAsset = assets.find((asset: any) => 
          asset.name.includes('.dmg') && !asset.name.includes('blockmap')
        );
        downloadUrl = dmgAsset?.browser_download_url || null;
      } else if (platform.includes('win')) {
        // Windows - look for exe file
        const exeAsset = assets.find((asset: any) => 
          asset.name.includes('.exe') || asset.name.includes('win')
        );
        downloadUrl = exeAsset?.browser_download_url || null;
      } else {
        // Linux - look for AppImage or tar.gz
        const linuxAsset = assets.find((asset: any) => 
          asset.name.includes('.AppImage') || 
          asset.name.includes('.tar.gz') || 
          asset.name.includes('linux')
        );
        downloadUrl = linuxAsset?.browser_download_url || null;
      }
      
      if (downloadUrl) {
        // Create a temporary anchor element to trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = downloadUrl.split('/').pop() || 'par-Noir-Desktop';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // No matching asset found, open releases page
        window.open(release.html_url, '_blank');
      }
    } catch (error) {
      console.error('Failed to download desktop app:', error);
      // Fallback to GitHub releases page
      window.open('https://github.com/bymjmazzei/par-Noir/releases/latest', '_blank');
    } finally {
      setIsDownloading(false);
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

  // If it's a webapp, show install/download button
  return (
    <button
      onClick={handleInstallClick}
      disabled={pwaState.isInstalling || isDownloading}
      className="pwa-button inline-flex items-center space-x-2"
      title={isMobile ? 'Install App' : 'Download Desktop App'}
    >
      {isMobile ? (
        <>
          {pwaState.isInstalling ? 'Installing...' : 'Install'}
        </>
      ) : (
        <>
          <Download className="h-4 w-4" />
          <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
        </>
      )}
    </button>
  );
};

export default PWAInstall; 