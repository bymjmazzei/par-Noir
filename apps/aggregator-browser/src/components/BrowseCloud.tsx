/**
 * Browse Cloud Component
 * Displays all files from connected cloud storage accounts
 * Mimics dashboard storage page with visibility indicators
 */

import React, { useState, useEffect } from 'react';
import { Cloud, RefreshCw, Image, Video, FileText, File, Lock, Globe, Grid, List, Search, Filter } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { PNOAuthService } from '../services/pnOAuthService';

interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  thumbnailLink?: string;
  webViewLink?: string;
  isPublic: boolean;
  accountId: string;
  accountEmail?: string;
  modifiedTime?: string;
}

export function BrowseCloud({ onClose, onUploadClick }: { onClose: () => void; onUploadClick?: () => void }) {
  const { userState } = useUserState();
  const { error: showError } = useToast();
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [cloudAccounts, setCloudAccounts] = useState<Array<{ provider: string; accountId: string; email?: string; displayName?: string }>>([]);

  // Load cloud accounts
  useEffect(() => {
    const loadCloudAccounts = async () => {
      if (!userState.isUnlocked || !userState.pnIdentifier) {
        return;
      }

      try {
        // Get valid access token (will refresh if expired)
        const accessToken = await PNOAuthService.getValidAccessToken();
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        
        if (!accessToken) {
          console.error('[BrowseCloud] No valid access token available');
          setCloudAccounts([]);
          return;
        }
        
        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${userState.pnIdentifier}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setCloudAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error('[BrowseCloud] Failed to load cloud accounts:', error);
      }
    };

    loadCloudAccounts();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  // Load files from all cloud accounts
  const loadFiles = async () => {
    if (!userState.isUnlocked || !userState.pnIdentifier || cloudAccounts.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const allFiles: CloudFile[] = [];

      // Load files from all accounts (API currently returns all files)
      try {
        // Get valid access token (will refresh if expired)
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          console.error('[BrowseCloud] No valid access token available');
          setIsLoading(false);
          showError('Your session may have expired. Please reconnect your pN.');
          return;
        }
        
        const response = await fetch(`${apiEndpoint}/api/drive/files`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.files && Array.isArray(data.files)) {
            // Get all public file IDs from aggregator index for quick lookup
            const publicFileIds = new Set<string>();
            try {
              const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              if (metadataResponse.ok) {
                const metadataData = await metadataResponse.json();
                if (Array.isArray(metadataData)) {
                  metadataData.forEach((entry: any) => {
                    if (entry.fileId) {
                      publicFileIds.add(entry.fileId);
                    }
                  });
                }
              }
            } catch (error) {
              console.error('[BrowseCloud] Failed to load public file IDs:', error);
            }

            // Map files with visibility info
            const filesWithVisibility = data.files.map((file: any) => ({
              id: file.id,
              name: file.name,
              mimeType: file.mimeType || 'application/octet-stream',
              size: file.size ? parseInt(file.size) : undefined,
              thumbnailLink: file.thumbnailLink,
              webViewLink: file.webViewLink,
              isPublic: publicFileIds.has(file.id),
              accountId: 'all', // API returns all files, not filtered by account
              accountEmail: cloudAccounts[0]?.email, // Use first account email as fallback
              modifiedTime: file.modifiedTime
            }));
            
            allFiles.push(...filesWithVisibility);
          }
        }
      } catch (error) {
        console.error('[BrowseCloud] Failed to load files:', error);
      }

      setFiles(allFiles);
    } catch (error) {
      console.error('[BrowseCloud] Failed to load files:', error);
      showError('Failed to load cloud files');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (cloudAccounts.length > 0) {
      loadFiles();
    }
  }, [cloudAccounts]);

  // Filter files
  const filteredFiles = files.filter(file => {
    // Search filter
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Visibility filter
    if (filterVisibility === 'public' && !file.isPublic) {
      return false;
    }
    if (filterVisibility === 'private' && file.isPublic) {
      return false;
    }

    return true;
  });

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) {
      return <Image className="h-8 w-8 text-blue-400" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Video className="h-8 w-8 text-purple-400" />;
    }
    if (mimeType.includes('document')) {
      return <FileText className="h-8 w-8 text-red-400" />;
    }
    return <File className="h-8 w-8 text-gray-400" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col" style={{ paddingBottom: '64px' }}>
      {/* Header with Railway Toggle */}
      <div className="border-b border-neutral-700">
        <div className="flex items-center justify-between p-6">
          <div className="flex items-center space-x-3">
            <Cloud className="h-6 w-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white">Browse Cloud</h2>
          </div>
        </div>
        {/* Railway Navigation */}
        <div className="flex items-center space-x-1 px-6 pb-3 overflow-x-auto scrollbar-hide">
          <button
            onClick={onUploadClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              false
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            Upload
          </button>
          <button
            onClick={() => {}}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              true
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            Browse Cloud
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-neutral-700">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-2 text-text-secondary hover:text-white transition-colors"
            title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
          >
            {viewMode === 'grid' ? <List className="h-5 w-5" /> : <Grid className="h-5 w-5" />}
          </button>
          <button
            onClick={loadFiles}
            disabled={isLoading}
            className="p-2 text-text-secondary hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-neutral-700 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Visibility Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-text-secondary" />
          <button
            onClick={() => setFilterVisibility('all')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors ${
              filterVisibility === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterVisibility('public')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors flex items-center space-x-1 ${
              filterVisibility === 'public'
                ? 'bg-green-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            <Globe className="h-3 w-3" />
            <span>Public</span>
          </button>
          <button
            onClick={() => setFilterVisibility('private')}
            className={`px-3 py-1 rounded-lg text-sm transition-colors flex items-center space-x-1 ${
              filterVisibility === 'private'
                ? 'bg-orange-600 text-white'
                : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
            }`}
          >
            <Lock className="h-3 w-3" />
            <span>Private</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="h-12 w-12 text-blue-400 animate-spin mx-auto mb-4" />
              <p className="text-text-secondary">Loading cloud files...</p>
            </div>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Cloud className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-white font-medium mb-2">No files found</p>
              <p className="text-text-secondary text-sm">
                {cloudAccounts.length === 0
                  ? 'Connect cloud storage in the dashboard to browse files'
                  : searchQuery || filterVisibility !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Upload files to see them here'}
              </p>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className={`bg-neutral-800 rounded-lg p-4 cursor-pointer transition-all hover:bg-neutral-700 border-2 ${
                  file.isPublic
                    ? 'border-green-500/50 hover:border-green-500'
                    : 'border-orange-500/50 hover:border-orange-500'
                }`}
                onClick={() => {
                  if (file.webViewLink) {
                    window.open(file.webViewLink, '_blank');
                  }
                }}
              >
                <div className="flex flex-col items-center text-center">
                  {file.thumbnailLink && file.mimeType.startsWith('image/') ? (
                    <img
                      src={file.thumbnailLink}
                      alt={file.name}
                      className="w-full h-24 object-cover rounded mb-2"
                    />
                  ) : (
                    <div className="w-full h-24 bg-neutral-700 rounded mb-2 flex items-center justify-center">
                      {getFileIcon(file.mimeType)}
                    </div>
                  )}
                  <h3 className="text-sm font-medium text-white truncate w-full mb-1">
                    {file.name}
                  </h3>
                  <p className="text-xs text-text-secondary mb-2">
                    {formatFileSize(file.size)}
                  </p>
                  <div className="flex items-center space-x-1 text-xs">
                    {file.isPublic ? (
                      <Globe className="h-3 w-3 text-green-400" title="Public" />
                    ) : (
                      <Lock className="h-3 w-3 text-orange-400" title="Private" />
                    )}
                    {file.accountEmail && (
                      <span className="text-text-secondary truncate max-w-[100px]" title={file.accountEmail}>
                        {file.accountEmail.split('@')[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className={`bg-neutral-800 rounded-lg p-4 cursor-pointer transition-all hover:bg-neutral-700 border-l-4 ${
                  file.isPublic ? 'border-l-green-500' : 'border-l-orange-500'
                }`}
                onClick={() => {
                  if (file.webViewLink) {
                    window.open(file.webViewLink, '_blank');
                  }
                }}
              >
                <div className="flex items-center space-x-4">
                  {file.thumbnailLink && file.mimeType.startsWith('image/') ? (
                    <img
                      src={file.thumbnailLink}
                      alt={file.name}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-neutral-700 rounded flex items-center justify-center flex-shrink-0">
                      {getFileIcon(file.mimeType)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-medium truncate">{file.name}</h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-text-secondary">
                      <span>{formatFileSize(file.size)}</span>
                      {file.modifiedTime && <span>{formatDate(file.modifiedTime)}</span>}
                      {file.accountEmail && <span>{file.accountEmail}</span>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {file.isPublic ? (
                      <Globe className="h-5 w-5 text-green-400" title="Public" />
                    ) : (
                      <Lock className="h-5 w-5 text-orange-400" title="Private" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

