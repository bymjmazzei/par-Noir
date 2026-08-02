import React from 'react';
import { Download, Lock, Info, X } from 'lucide-react';
import { DesktopSecureFolderPanel } from './DesktopSecureFolderPanel';
import { isDesktopShell } from './FileStorageAggregatorTypes';
import { downloadLatestDesktopApp } from './FileStorageAggregatorHelpers';

export interface SecureFolderSectionProps {
  hideSecureFolderSection?: boolean;
  showDesktopAppInfo: boolean;
  setShowDesktopAppInfo: (show: boolean) => void;
}

export function SecureFolderSection({
  hideSecureFolderSection = false,
  showDesktopAppInfo,
  setShowDesktopAppInfo,
}: SecureFolderSectionProps) {
  if (hideSecureFolderSection) return null;

  if (isDesktopShell) {
    return <DesktopSecureFolderPanel />;
  }

  return (
    <>
      <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-4">
              <Lock className="h-5 w-5 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white">Secure Folder</h3>
                <p className="text-text-secondary text-sm">
                  Access your encrypted files with the desktop app
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowDesktopAppInfo(true)}
              className="flex items-center space-x-2 text-text-secondary hover:text-text-primary transition-colors"
            >
              <Info className="h-4 w-4" />
              <span className="text-sm">About the Desktop App</span>
            </button>
          </div>

          <button
            onClick={() => {
              void downloadLatestDesktopApp();
            }}
            className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors w-full md:w-auto md:ml-4 shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>Download Desktop App</span>
          </button>
        </div>
      </div>

      {showDesktopAppInfo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDesktopAppInfo(false)}
        >
          <div
            className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">About the Desktop App</h3>
              <button
                onClick={() => setShowDesktopAppInfo(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-text-secondary text-sm mb-4">
              The par Noir Desktop App provides secure, local access to your encrypted files stored in Google Drive.
              Files are automatically synced and encrypted with your pN credentials.
            </p>

            <div className="space-y-2 text-xs text-text-secondary">
              <p>• Secure local file access</p>
              <p>• Automatic encryption/decryption</p>
              <p>• Works offline with cached files</p>
              <p>• Native desktop integration</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
