import { X, RefreshCw } from 'lucide-react';
import type { DriveFile } from './storageTypes';

export type ShareIndexer = {
  id: string;
  name: string;
  description?: string;
};

export interface ShareSettingsModalProps {
  sharingFile: DriveFile;
  shareVisibility: 'public' | 'private';
  setShareVisibility: (v: 'public' | 'private') => void;
  shareNSFW: boolean;
  setShareNSFW: (v: boolean) => void;
  thirdPartyIndexers: ShareIndexer[];
  indexerToggles: Record<string, boolean>;
  isLoadingIndexers: boolean;
  indexerError: string | null;
  isSavingShare: boolean;
  loadThirdPartyIndexers: (fileId: string) => void;
  onIndexerToggle: (indexerId: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ShareSettingsModal({
  sharingFile,
  shareVisibility,
  setShareVisibility,
  shareNSFW,
  setShareNSFW,
  thirdPartyIndexers,
  indexerToggles,
  isLoadingIndexers,
  indexerError,
  isSavingShare,
  loadThirdPartyIndexers,
  onIndexerToggle,
  onSave,
  onClose,
}: ShareSettingsModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div>
            <h2 className="text-xl font-semibold text-white uppercase tracking-wide">Share Settings</h2>
            <p className="text-sm text-text-secondary mt-1 truncate max-w-xl">
              {sharingFile.name.replace(/\.encrypted$/i, '')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary transition-colors rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-8 max-h-[70vh] overflow-y-auto">
          <section>
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">
              Visibility
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {(['public', 'private'] as const).map((option) => {
                const isActive = shareVisibility === option;
                return (
                  <button
                    key={option}
                    onClick={() => {
                      setShareVisibility(option);
                      if (option === 'public' && thirdPartyIndexers.length === 0) {
                        loadThirdPartyIndexers(sharingFile.id);
                      }
                    }}
                    className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                      isActive
                        ? 'border-blue-500 bg-blue-600/20 text-white'
                        : 'border-neutral-700 bg-neutral-800 text-text-secondary hover:text-text-primary hover:border-neutral-500'
                    }`}
                  >
                    <span className="text-sm font-semibold uppercase tracking-wide block">
                      {option === 'public' ? 'PUBLIC' : 'PRIVATE'}
                    </span>
                    <span className="mt-1 text-xs text-text-secondary">
                      {option === 'public'
                        ? 'Anyone with the public link can access this file.'
                        : 'Only you (and collaborators you invite) can view this file.'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {shareVisibility === 'public' && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                  Content Classification
                </h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between border border-neutral-800 bg-neutral-900/70 rounded-lg px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white uppercase tracking-wide mb-1">
                      NSFW Content
                    </p>
                    <p className="text-xs text-text-secondary">
                      Mark this content as Not Safe For Work (18+)
                    </p>
                  </div>
                  <button
                    onClick={() => setShareNSFW(!shareNSFW)}
                    className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded-md border transition-colors ${
                      shareNSFW
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-neutral-800 border-neutral-600 text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {shareNSFW ? 'NSFW' : 'PUBLIC'}
                  </button>
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wide">
                Third-Party Indexing
              </h3>
              {shareVisibility === 'public' && (
                <span className="text-xs text-text-secondary">
                  Choose which par Noir partners can surface this file.
                </span>
              )}
            </div>

            {shareVisibility !== 'public' ? (
              <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-text-secondary">
                Make the file PUBLIC to manage third-party indexing visibility.
              </div>
            ) : (
              <div className="space-y-4">
                {isLoadingIndexers ? (
                  <div className="flex items-center space-x-2 text-text-secondary text-sm">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Loading partners...</span>
                  </div>
                ) : indexerError ? (
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                    {indexerError}
                  </div>
                ) : thirdPartyIndexers.length === 0 ? (
                  <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-text-secondary">
                    No third-party indexers are currently available.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {thirdPartyIndexers.map((indexer) => {
                      const enabled = Boolean(indexerToggles[indexer.id]);
                      return (
                        <div
                          key={indexer.id}
                          className="flex items-center justify-between border border-neutral-800 bg-neutral-900/70 rounded-lg px-4 py-3"
                        >
                          <div className="mr-4">
                            <p className="text-sm font-semibold text-white uppercase tracking-wide">
                              {indexer.name}
                            </p>
                            {indexer.description && (
                              <p className="text-xs text-text-secondary mt-1 max-w-md">
                                {indexer.description}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => onIndexerToggle(indexer.id)}
                            className={`px-4 py-2 text-xs font-semibold uppercase tracking-widest rounded-md border transition-colors ${
                              enabled
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-neutral-800 border-neutral-600 text-text-secondary hover:text-text-primary'
                            }`}
                          >
                            {enabled ? 'ENABLED' : 'DISABLED'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-neutral-800 bg-neutral-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary transition-colors"
            disabled={isSavingShare}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSavingShare || (shareVisibility === 'public' && isLoadingIndexers)}
            className="px-5 py-2 text-sm font-semibold uppercase tracking-wide rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSavingShare ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
