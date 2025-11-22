/**
 * Upload Modal Component
 * Uses the dashboard's FileStorageAggregator component directly
 */

import React, { useState, useEffect } from 'react';
import { FileStorageAggregator } from './FileStorageAggregator';
import { TextPostEditor } from './TextPostEditor';
import { ContentPreferences } from './ContentPreferences';
import { useUserState } from '../contexts/UserStateContext';
import { TextPostData, Feed } from '../types/aggregator';
import { createTextPost } from '../services/textPostService';
import { PNOAuthService } from '../services/pnOAuthService';
import { Settings } from 'lucide-react';
import { FeedService } from '../services/feedService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface UploadModalProps {
  feeds?: Feed[];
  onClose: () => void;
  onUploadComplete?: () => void;
}

export function UploadModal({ feeds: propsFeeds, onClose, onUploadComplete }: UploadModalProps) {
  const { userState } = useUserState();
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [showContentPreferences, setShowContentPreferences] = useState(false);
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

  const handleTextPostSave = async (textPost: TextPostData) => {
    if (!authenticatedUser?.id) {
      alert('Please unlock your pN to create thoughts');
      return;
    }

    if (!accountId) {
      alert('Please wait for accounts to load');
      return;
    }

    try {
      const result = await createTextPost(
        textPost,
        accountId,
        {
          title: textPost.content.substring(0, 50),
          description: textPost.content,
        }
      );

      if (result.success) {
        setShowTextEditor(false);
        if (onUploadComplete) {
          onUploadComplete();
        }
        // Close modal after a brief delay to show success
        setTimeout(() => {
          onClose();
        }, 500);
      } else {
        alert(`Failed to create thought: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error creating thought: ${error?.message || 'Unknown error'}`);
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
      {/* Railway Header with Settings Button */}
      <div 
        className="fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 z-[100] bg-neutral-900 border-b border-neutral-800"
      >
        {/* Left side - Settings button with same positioning and size as lock button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowContentPreferences(true);
          }}
          className="p-2 text-white/85 hover:text-white transition-colors flex items-center justify-center flex-shrink-0"
          title="Content Preferences"
          style={{ marginTop: '12px' }} {/* Match lock button's top-3 (12px) */}
        >
          <Settings className="h-5 w-5" />
        </button>
        
        {/* Center - Title */}
        <h2 className="text-sm font-medium uppercase tracking-wide text-white flex-1 text-center">
          Upload from Secure Cloud
        </h2>
        
        {/* Right side - Spacer for lock button */}
        <div className="w-9 h-9 flex-shrink-0" />
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

      {/* Content Preferences Modal */}
      {showContentPreferences && (
        <ContentPreferences
          feeds={feeds}
          onClose={() => setShowContentPreferences(false)}
        />
      )}
    </div>
  );
}
