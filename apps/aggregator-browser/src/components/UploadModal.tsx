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

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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

      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) return;

        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${authenticatedUser.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const accounts = data.accounts || [];
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
        // Multi-page thought: save each page as a separate thought, then create a collection
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};
        
        console.log(`[UploadModal] Creating multi-page thought with ${pages.length} pages`);
        
        // Save each page as a separate thought and collect thumbnail fileIds (like PDFs)
        const thumbnailFileIds: string[] = [];
        const thumbnailTokens: Record<string, string> = {};
        
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pageTitle = pages.length > 1 
            ? `${metadata.name || 'Thought'} (Page ${i + 1})`
            : (metadata.name || page.content.substring(0, 50));
          
          // Refresh token before each page to prevent expiration during multi-page uploads
          try {
            const { PNOAuthService } = await import('../services/pnOAuthService');
            await PNOAuthService.getValidAccessToken(true); // Force refresh to prevent expiration
          } catch (tokenErr) {
            console.warn(`[UploadModal] Token refresh warning before page ${i + 1}:`, tokenErr);
            // Continue anyway - createTextPost will try to get a token
          }
          
          const result = await createTextPost(
            page,
            accountId,
            {
              title: pageTitle,
              description: i === 0 ? metadata.description : undefined, // Only add description to first page
              isNSFW: false,
              keywords: metadata.keywords || metadata.tags || [],
              tags: metadata.tags || metadata.keywords || [],
              isPartOfCollection: true, // Mark as part of collection - thumbnail will be private
            }
          );
          
          if (result.success && result.fileId) {
            // Use thumbnail fileId if available (like PDFs use thumbnail fileIds)
            if (result.thumbnailFileId) {
              thumbnailFileIds.push(result.thumbnailFileId);
              // Store thumbnail share token if available (for instant thumbnail loading)
              if (result.thumbnailShareToken) {
                thumbnailTokens[result.thumbnailFileId] = JSON.stringify(result.thumbnailShareToken);
              }
              console.log(`[UploadModal] Saved page ${i + 1}/${pages.length}, thought fileId: ${result.fileId}, thumbnail fileId: ${result.thumbnailFileId}`);
            } else {
              console.warn(`[UploadModal] Page ${i + 1} has no thumbnail fileId, using thought fileId as fallback`);
              thumbnailFileIds.push(result.fileId);
            }
          } else {
            throw new Error(`Failed to save page ${i + 1}: ${result.error || 'Unknown error'}`);
          }
        }
        
        // Create collection with thumbnail fileIds (like PDFs use thumbnail fileIds)
        if (thumbnailFileIds.length > 0) {
          const collectionResult = await createCollection(
            {
              collectionFileIds: thumbnailFileIds,
              title: metadata.name || `Thought Collection (${thumbnailFileIds.length} pages)`,
              thumbnailTokens: thumbnailTokens // Include tokens for instant thumbnail loading
            },
            accountId,
            {
              title: metadata.name || `Thought Collection`,
              description: metadata.description || '',
              keywords: metadata.keywords || metadata.tags || [],
              tags: metadata.tags || metadata.keywords || [],
              isPublic: true,
              isNSFW: false,
              isThoughtCollection: true // Mark as thought collection to distinguish from regular collections
            }
          );
          
          if (collectionResult.success) {
            console.log(`[UploadModal] Created collection with ${thumbnailFileIds.length} pages, fileId: ${collectionResult.fileId}`);
            setShowTextEditor(false);
            if (onUploadComplete) {
              onUploadComplete();
            }
            setTimeout(() => {
              onClose();
            }, 500);
          } else {
            throw new Error(`Failed to create collection: ${collectionResult.error || 'Unknown error'}`);
          }
        }
      } else {
        // Single page thought - save normally
        const result = await createTextPost(
          textPost,
          accountId,
          {
            title: textPost.metadata?.name || textPost.content.substring(0, 50),
            description: textPost.metadata?.description || textPost.content,
            isNSFW: textPost.isNSFW || false,
            keywords: textPost.metadata?.keywords || textPost.metadata?.tags || (textPost.category ? [textPost.category] : undefined),
            tags: textPost.metadata?.tags || textPost.metadata?.keywords || (textPost.category ? [textPost.category] : undefined),
          }
        );

        if (result.success) {
          setShowTextEditor(false);
          if (onUploadComplete) {
            onUploadComplete();
          }
          setTimeout(() => {
            onClose();
          }, 500);
        } else {
          alert(`Failed to create thought: ${result.error}`);
        }
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
        className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-[100] bg-neutral-900 border-b border-neutral-800"
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
      <div className="flex-1 overflow-y-auto p-6" style={{ marginTop: '48px' }}>
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
