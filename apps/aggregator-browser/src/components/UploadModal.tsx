/**
 * Upload Modal Component
 * Uses the dashboard's FileStorageAggregator component directly
 */

import React, { useState, useEffect } from 'react';
import { FileStorageAggregator } from './FileStorageAggregator';
import { TextPostEditor } from './TextPostEditor';
import { ContentPreferencesPanel } from './ContentPreferencesPanel';
import { useUserState } from '../contexts/UserStateContext';
import { TextPostData, Feed } from '../types/aggregator';
import { createTextPost } from '../services/textPostService';
import { createCollection } from '../services/collectionService';
import { PNOAuthService } from '../services/pnOAuthService';
import { FeedService } from '../services/feedService';
import { Settings } from 'lucide-react';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../services/encryptionService';
import { accountsCacheService } from '../services/accountsCacheService';
import { uploadQueueService } from '../services/uploadQueueService';

import { API_ENDPOINT } from '../config/api';

interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata: {
    originalName: string;
    originalSize: number;
    originalMimeType: string;
  };
}

interface UploadModalProps {
  feeds?: Feed[];
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function UploadModal({ feeds: propsFeeds, onClose, onUploadComplete }: UploadModalProps) {
  const { userState } = useUserState();
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>(propsFeeds || []);
  
  // Convert browser app's userState to dashboard's authenticatedUser format
  const authenticatedUser = userState.isUnlocked && userState.pnIdentifier ? {
    id: userState.pnIdentifier,
    pnName: userState.pnName,
    publicKey: userState.publicKey,
    nickname: userState.nickname,
    accessToken: userState.accessToken
  } : null;

  // Load accounts to get accountId
  useEffect(() => {
    const loadAccounts = async () => {
      if (!authenticatedUser?.id) return;

      // Check cache first
      const cached = accountsCacheService.get(authenticatedUser.id);
      if (cached && cached.length > 0) {
        // Use the first account's ID
        setAccountId(cached[0].id || cached[0].accountId || authenticatedUser.id);
        return;
      }

      // Cache miss - fetch from API
      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          // Fallback to authenticated user ID
          setAccountId(authenticatedUser.id);
          return;
        }

        const response = await fetch(`${API_ENDPOINT}/api/storage/accounts/${authenticatedUser.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const accounts = data.accounts || [];
          // Cache the result
          accountsCacheService.set(authenticatedUser.id, accounts);
          if (accounts.length > 0) {
            // Use the first account's ID
            setAccountId(accounts[0].id || accounts[0].accountId || authenticatedUser.id);
          } else {
            // Fallback to authenticated user ID
            setAccountId(authenticatedUser.id);
          }
        } else {
          // Fallback to authenticated user ID
          setAccountId(authenticatedUser.id);
        }
      } catch (error) {
        console.error('Failed to load accounts:', error);
        // Fallback to authenticated user ID
        setAccountId(authenticatedUser.id);
      }
    };

    loadAccounts();
  }, [authenticatedUser?.id]);

  // Load feeds for content preferences if not provided as prop
  useEffect(() => {
    if (propsFeeds && propsFeeds.length > 0) {
      setFeeds(propsFeeds);
      return;
    }
    const loadFeeds = async () => {
      try {
        const feedList = await FeedService.listFeeds();
        setFeeds(feedList.feeds || []);
      } catch (error) {
        console.error('Failed to load feeds:', error);
      }
    };
    loadFeeds();
  }, [propsFeeds]);

  const handleTextPostSave = async (textPost: TextPostData | any) => {
    if (!authenticatedUser?.id) {
      alert('Please unlock your pN to create thoughts');
      return;
    }

    if (!accountId) {
      alert('Please wait for accounts to load');
      return;
    }

    try {
      // Check if this is a multi-page thought
      const isMultiPage = (textPost as any).isMultiPage && (textPost as any).pages && Array.isArray((textPost as any).pages) && (textPost as any).pages.length > 1;
      
      if (isMultiPage) {
        // Multi-page thought: use upload queue for non-blocking upload
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};
        
        console.log(`[UploadModal] Creating multi-page thought with ${pages.length} pages via upload queue`);
        
        // Close editor immediately - returns to upload page
        setShowTextEditor(false);
        
        // Add to upload queue
        const taskId = uploadQueueService.addTask({
          type: 'multiPage',
          pages,
          accountId,
          metadata: {
            name: metadata.name || 'thought-collection',
            title: metadata.title || metadata.name || 'thought-collection',
            description: metadata.description || '',
            keywords: metadata.keywords || metadata.tags || [],
            tags: metadata.tags || metadata.keywords || [],
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || metadata.isNSFW || false,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Multi-page thought upload completed:', result);
            if (onUploadComplete) {
              onUploadComplete();
            }
            // Don't close modal - user stays on upload page
          },
          onError: (error) => {
            console.error('[UploadModal] Multi-page thought upload failed:', error);
            alert(`Failed to create multi-page thought: ${error.message}`);
          },
        });
        
        console.log(`[UploadModal] Multi-page thought queued for upload, taskId: ${taskId}`);
      } else {
        // Single page thought - use upload queue for non-blocking upload
        const metadata = textPost.metadata || {};
        
        console.log(`[UploadModal] Creating single-page thought via upload queue`);
        
        // Close editor immediately - returns to upload page
        setShowTextEditor(false);
        
        // Add to upload queue
        const taskId = uploadQueueService.addTask({
          type: 'textPost',
          textPost,
          accountId,
          metadata: {
            title: textPost.metadata?.name || textPost.content.substring(0, 50),
            description: textPost.metadata?.description || textPost.content,
            keywords: textPost.metadata?.keywords || textPost.metadata?.tags || (textPost.category ? [textPost.category] : undefined),
            tags: textPost.metadata?.tags || textPost.metadata?.keywords || (textPost.category ? [textPost.category] : undefined),
            isPublic: metadata.isPublic !== undefined ? metadata.isPublic : true,
            isNSFW: textPost.isNSFW || false,
          },
          onComplete: (result) => {
            console.log('[UploadModal] Single-page thought upload completed:', result);
            if (onUploadComplete) {
              onUploadComplete();
            }
            // Don't close modal - user stays on upload page
          },
          onError: (error) => {
            console.error('[UploadModal] Single-page thought upload failed:', error);
            alert(`Failed to create thought: ${error.message}`);
          },
        });
        
        console.log(`[UploadModal] Single-page thought queued for upload, taskId: ${taskId}`);
      }
    } catch (error: any) {
      console.error('Failed to create text post:', error);
      alert(`Failed to create thought: ${error?.message || 'Unknown error'}`);
    }
  };

  if (showTextEditor) {
    return (
      <TextPostEditor
        onSave={handleTextPostSave}
        onCancel={() => setShowTextEditor(false)}
      />
    );
  }

  return (
    <div className="h-full w-full bg-neutral-900 flex flex-col overflow-y-auto" style={{ paddingBottom: '64px' }}>
      {/* Railway Header */}
      <div
        className="fixed left-0 right-0 h-12 flex items-center justify-between px-4 z-[100] bg-neutral-900 border-b border-neutral-800"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Left - Settings Button */}
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-text-secondary hover:text-white transition-colors"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </button>
        
        {/* Center - Title */}
        <h2 className="text-sm font-medium uppercase tracking-wide text-white">
          Upload from Secure Cloud
        </h2>
        
        {/* Right - Spacer (for balance) */}
        <div className="w-9" />
      </div>

      {/* FileStorageAggregator Component */}
      <div
        className="flex-1 overflow-y-auto p-6"
        style={{ marginTop: 'calc(48px + env(safe-area-inset-top, 0px))' }}
      >
        <FileStorageAggregator 
          authenticatedUser={authenticatedUser} 
          hideSecureFolderSection={true}
          onOpenTextEditor={(accountId) => {
            setAccountId(accountId);
            setShowTextEditor(true);
          }}
        />
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <ContentPreferencesPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
