import React from 'react';
import { Download, Lock } from 'lucide-react';
import { DesktopSecureFolderPanel } from './DesktopSecureFolderPanel';
import { isDesktopShell } from './FileStorageAggregatorTypes';
import { downloadLatestDesktopApp } from './FileStorageAggregatorHelpers';
import { SectionInfo } from '../common/SectionInfo';

export interface SecureFolderSectionProps {
  hideSecureFolderSection?: boolean;
}

export function SecureFolderSection({
  hideSecureFolderSection = false,
}: SecureFolderSectionProps) {
  if (hideSecureFolderSection) return null;

  if (isDesktopShell) {
    return <DesktopSecureFolderPanel />;
  }

  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-4 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3 mb-4">
            <Lock className="h-5 w-5 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">Secure Folder</h3>
                <SectionInfo title="About the Desktop App">
                  <p>
                    The par Noir Desktop App provides secure, local access to your encrypted files stored in Google
                    Drive. Files are automatically synced and encrypted with your pN credentials.
                  </p>
                  <ul>
                    <li>Secure local file access</li>
                    <li>Automatic encryption/decryption</li>
                    <li>Works offline with cached files</li>
                    <li>Native desktop integration</li>
                  </ul>
                </SectionInfo>
              </div>
              <p className="text-text-secondary text-sm">
                Access your encrypted files with the desktop app
              </p>
            </div>
          </div>
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
  );
}
