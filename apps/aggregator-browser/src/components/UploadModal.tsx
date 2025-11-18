/**
 * Upload Modal Component
 * Integrates dashboard's Google Drive upload functionality into browser
 */

import React, { useState, useRef } from 'react';
import { X, Upload, File, Image, Video, FileText, AlertCircle } from 'lucide-react';
import { useUserState } from '../contexts/UserStateContext';
import { useToast } from '../hooks/useToast';
import { PNOAuthService } from '../services/pnOAuthService';
import { ContentRating, FeedCategory } from '../types/aggregator';
import { ContentRatingBadge } from './ContentRatingBadge';
import { FEED_CATEGORIES } from '../constants/feedCategories';

interface UploadModalProps {
  onClose: () => void;
  onUploadComplete?: () => void;
  onBrowseCloudClick?: () => void;
}

export function UploadModal({ onClose, onUploadComplete, onBrowseCloudClick }: UploadModalProps) {
  const { userState } = useUserState();
  const { success, error: showError } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [contentRating, setContentRating] = useState<ContentRating>('T13+');
  const [feedCategories, setFeedCategories] = useState<FeedCategory[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [description, setDescription] = useState('');
  const [cloudAccounts, setCloudAccounts] = useState<Array<{ provider: string; accountId: string; email?: string; displayName?: string }>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load available cloud storage accounts via API
  React.useEffect(() => {
    const loadCloudAccounts = async () => {
      if (!userState.isUnlocked || !userState.pnIdentifier) {
        setCloudAccounts([]);
        setIsLoadingAccounts(false);
        return;
      }

      try {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        console.log(`[UploadModal] Loading cloud accounts for pN: ${userState.pnIdentifier}`);
        
        // Get valid access token (will refresh if expired)
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          console.error('[UploadModal] No valid access token available');
          setCloudAccounts([]);
          setIsLoadingAccounts(false);
          return;
        }
        
        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${userState.pnIdentifier}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        console.log(`[UploadModal] API response status: ${response.status} ${response.statusText}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log(`[UploadModal] API response data:`, data);
          console.log(`[UploadModal] API response data (stringified):`, JSON.stringify(data, null, 2));
          const accounts = data.accounts || [];
          console.log(`[UploadModal] Found ${accounts.length} cloud account(s):`, accounts);
          if (accounts.length === 0) {
            console.warn(`[UploadModal] No accounts returned! Check Railway logs for [StorageAccounts] entries`);
          }
          setCloudAccounts(accounts);
          // Auto-select first account if available
          if (accounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accounts[0].accountId);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[UploadModal] API error (${response.status}):`, errorText);
          setCloudAccounts([]);
        }
      } catch (error) {
        console.error('[UploadModal] Failed to load cloud accounts:', error);
        setCloudAccounts([]);
      } finally {
        setIsLoadingAccounts(false);
      }
    };

    loadCloudAccounts();
  }, [userState.isUnlocked, userState.pnIdentifier]);

  const handleFileSelect = (file: File) => {
    if (file) {
      setSelectedFile(file);
      // Auto-detect content rating based on file type
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setContentRating('T13+');
      }
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleTagAdd = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const toggleFeedCategory = (category: FeedCategory) => {
    if (feedCategories.includes(category)) {
      setFeedCategories(feedCategories.filter(c => c !== category));
    } else {
      setFeedCategories([...feedCategories, category]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showError('Please select a file to upload');
      return;
    }

    if (cloudAccounts.length === 0) {
      showError('No cloud storage accounts connected. Please connect in the dashboard.');
      return;
    }

    if (!selectedAccountId) {
      showError('Please select a cloud storage account');
      return;
    }

    if (!userState.isUnlocked || !userState.pnIdentifier) {
      showError('Connect your pN to upload files');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const pnIdentifier = userState.pnIdentifier;
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

      setUploadProgress(10);

      // Convert file to base64 for API using FileReader (avoids stack overflow)
      const base64File = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // FileReader returns "data:type;base64,base64data" - extract just the base64 part
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(selectedFile);
      });

      setUploadProgress(25);

      // Upload via API endpoint (uses server-side Google Drive credentials)
      const uploadPayload = {
        fileData: base64File,
        fileName: selectedFile.name,
        mimeType: selectedFile.type || 'application/octet-stream',
        visibility: visibility,
        pnIdentifier: pnIdentifier,
        ownerDid: pnIdentifier,
        ...(visibility === 'public' && {
          contentRating: contentRating,
          tags: tags.length > 0 ? tags.join(',') : undefined,
          description: description || undefined,
          feedCategories: feedCategories.length > 0 ? feedCategories.join(',') : undefined
        })
      };

      setUploadProgress(40);

      // Get valid access token (will refresh if expired)
      const accessToken = await PNOAuthService.getValidAccessToken();
      
      if (!accessToken) {
        showError('Please connect your pN to upload files. Your session may have expired.');
        setUploading(false);
        return;
      }

      const uploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          fileData: base64File,
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          accountId: selectedAccountId // Pass selected account ID to use specific Google Drive account
        })
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed: ${uploadResponse.statusText} - ${errorText}`);
      }

      const uploadResult = await uploadResponse.json();
      setUploadProgress(75);

      // The API uploads to Google Drive (encrypted cloud folder via googleDriveProxyService)
      // Companion metadata file creation is handled by the Google Drive sync service
      // If public, submit to aggregator index
      if (visibility === 'public' && uploadResult.file?.id) {
        try {
          const fileId = uploadResult.file.id;
          const metadataPayload = {
            fileId: fileId,
            metadata: {
              fileId: fileId,
              name: selectedFile.name,
              fileType: selectedFile.type.startsWith('image/') ? 'image' :
                        selectedFile.type.startsWith('video/') ? 'video' :
                        selectedFile.type.startsWith('audio/') ? 'audio' : 'other',
              size: selectedFile.size,
              uploadDate: new Date().toISOString(),
              isPublic: true,
              contentRating: contentRating,
              feedCategories: feedCategories.length > 0 ? feedCategories : undefined,
              feedIds: [],
              keywords: tags,
              description: description || undefined,
              backend: 'google_drive',
              backendFileId: uploadResult.file.id,
              creator: {
                identifier: {
                  value: pnIdentifier
                }
              }
            },
            pnIdentifier: pnIdentifier
          };

          const indexResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadataPayload)
          });
          
          if (!indexResponse.ok) {
            const errorText = await indexResponse.text().catch(() => 'Unknown error');
            console.error('Failed to submit to aggregator index:', indexResponse.status, errorText);
            // Don't fail the upload, just log the error
          } else {
            console.log('✅ Metadata submitted to aggregator index successfully');
          }
        } catch (indexError: any) {
          console.error('Failed to submit to aggregator index:', indexError);
          // Don't fail the upload
        }
      }

      setUploadProgress(100);

      success('File uploaded successfully!');
      onUploadComplete?.();
      onClose();
    } catch (err: any) {
      console.error('Upload error:', err);
      showError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const getFileIcon = () => {
    if (!selectedFile) return <File className="h-12 w-12" />;
    if (selectedFile.type.startsWith('image/')) return <Image className="h-12 w-12" />;
    if (selectedFile.type.startsWith('video/')) return <Video className="h-12 w-12" />;
    return <FileText className="h-12 w-12" />;
  };

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col">
        {/* Header with Railway Toggle */}
        <div className="border-b border-neutral-700">
          <div className="flex items-center justify-between p-6">
            <h2 className="text-xl font-bold text-white">Upload File</h2>
          </div>
          {/* Railway Navigation */}
          <div className="flex items-center space-x-1 px-6 pb-3 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => {}}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                true
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
              }`}
            >
              Upload
            </button>
            <button
              onClick={onBrowseCloudClick}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                false
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
              }`}
            >
              Browse Cloud
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* File Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Select File</label>
            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className="border-2 border-dashed border-neutral-700 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <Upload className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                <p className="text-white mb-2">Click to select a file</p>
                <p className="text-text-secondary text-sm">or drag and drop</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="border border-neutral-700 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getFileIcon()}
                  <div>
                    <p className="text-white font-medium">{selectedFile.name}</p>
                    <p className="text-text-secondary text-sm">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-text-secondary hover:text-white text-lg"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">Visibility</label>
            <div className="flex space-x-4">
              <button
                onClick={() => setVisibility('private')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  visibility === 'private'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
                }`}
              >
                Private
              </button>
              <button
                onClick={() => setVisibility('public')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  visibility === 'public'
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
                }`}
              >
                Public
              </button>
            </div>
            {visibility === 'public' && (
              <p className="text-text-secondary text-sm mt-2">
                Public files will be indexed and visible to everyone
              </p>
            )}
          </div>

          {/* Public File Options */}
          {visibility === 'public' && (
            <>
              {/* Content Rating */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Content Rating</label>
                <div className="flex flex-wrap gap-2">
                  {(['GA', 'FF', 'T13+', 'YA16+', 'M18+', 'NSFW', 'X18+'] as ContentRating[]).map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setContentRating(rating)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                        contentRating === rating
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
                      }`}
                    >
                      <ContentRatingBadge rating={rating} size="sm" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed Categories */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Feed Categories (Optional)</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {Object.values(FEED_CATEGORIES).map((category) => (
                    <button
                      key={category.id}
                      onClick={() => toggleFeedCategory(category.id)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                        feedCategories.includes(category.id)
                          ? 'bg-blue-600 text-white'
                          : 'bg-neutral-800 text-text-secondary hover:bg-neutral-700'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Tags</label>
                <div className="flex space-x-2 mb-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleTagAdd();
                      }
                    }}
                    placeholder="Add a tag..."
                    className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleTagAdd}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center space-x-1 px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm"
                      >
                        <span>{tag}</span>
                        <button
                          onClick={() => handleTagRemove(tag)}
                          className="hover:text-blue-300"
                        >
                          <span className="text-xs">×</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description..."
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <p className="text-text-secondary text-xs mt-1">{description.length}/500</p>
              </div>
            </>
          )}

          {/* Cloud Storage Account Selection */}
          {isLoadingAccounts ? (
            <div className="bg-neutral-800/50 border border-neutral-700 rounded-lg p-4 flex items-start space-x-3">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">Loading cloud storage accounts...</p>
              </div>
            </div>
          ) : cloudAccounts.length === 0 ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-yellow-400 font-medium">No Cloud Storage Connected</p>
                <p className="text-text-secondary text-sm mt-1">
                  Connect cloud storage in the dashboard to upload files.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-white mb-2">Cloud Storage Account</label>
              <select
                value={selectedAccountId || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {cloudAccounts.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.displayName || account.email || `${account.provider} (${account.accountId})`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-700 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading || cloudAccounts.length === 0 || !selectedAccountId || isLoadingAccounts}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Uploading... {uploadProgress}%</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                <span>Upload</span>
              </>
            )}
          </button>
      </div>
    </div>
  );
}

