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

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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

        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${authenticatedUser.id}`, {
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
        // Multi-page thought: create ONE thought file with pages array, generate thumbnails, create collection
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};
        
        console.log(`[UploadModal] NEW CODE: Creating multi-page thought with ${pages.length} pages - will create ONE thought-collection file, NOT individual thought files`);
        
        // Get session and encryption setup
        const accessToken = await PNOAuthService.getValidAccessToken(true);
        if (!accessToken) {
          throw new Error('No valid access token');
        }

        const session = PNOAuthService.loadSession();
        if (!session?.did) {
          throw new Error('No DID in session for encryption');
        }

        let publicKey = session?.publicKey;
        if (!publicKey && session.accessToken) {
          try {
            const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
            if (userInfo.public_key) {
              publicKey = userInfo.public_key;
              const updatedSession = { ...session, publicKey };
              PNOAuthService.saveSession(updatedSession);
            }
          } catch (err) {
            // Silent fail
          }
        }
        
        if (!publicKey) {
          throw new Error('No publicKey available for encryption. Please unlock your pN.');
        }

        const encryptionManager = new EncryptionManager();

        // Create ONE thought file with pages array
        const thoughtCollectionData = {
          textPost: {
            ...pages[0], // Use first page as base structure
            pages: pages // Include all pages as an array
          },
          version: '1.0',
          createdAt: new Date().toISOString(),
          isMultiPage: true
        };
        
        const fileName = `thought-collection-${Date.now()}.thought-collection`;
        const fileContent = JSON.stringify(thoughtCollectionData);
        const thoughtFile = new File([fileContent], fileName, { type: 'application/json' });

        // Upload the thought file
        const fileArrayBuffer = await thoughtFile.arrayBuffer();
        const fileData = new Uint8Array(fileArrayBuffer);
        const encrypted = await encryptionManager.encrypt(fileData, session.did, publicKey);
        
        const packageData = {
          encrypted: encrypted.encrypted,
          iv: encrypted.iv,
          salt: encrypted.salt,
          metadata: {
            originalName: fileName,
            originalSize: thoughtFile.size,
            originalMimeType: 'application/json',
          },
        };
        
        let shareToken: any = undefined;
        try {
          const encryptionService = getEncryptionService();
          shareToken = await encryptionService.generateShareToken(packageData, {
            id: session.did,
            publicKey: publicKey
          });
        } catch (tokenError) {
          console.warn('[UploadModal] Share token generation failed:', tokenError);
        }
        
        const encryptedBlob = new Blob([JSON.stringify(packageData)], { type: 'application/json' });
        const base64File = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.includes(',') ? result.split(',')[1] : result);
          };
          reader.onerror = () => reject(new Error('Failed to read encrypted file'));
          reader.readAsDataURL(encryptedBlob);
        });
        
        const encryptedFileName = `${fileName}.encrypted`;
        const uploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            fileData: base64File,
            fileName: encryptedFileName,
            mimeType: 'application/json',
            accountId: accountId
          })
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => 'Unknown error');
          throw new Error(`Upload failed: ${errorText}`);
        }
        
        const uploadResult = await uploadResponse.json();
        const uploadedFile = uploadResult.file;
        
        if (!uploadedFile || !uploadedFile.id) {
          throw new Error('Upload succeeded but no file ID returned');
        }
        
        const thoughtFileId = uploadedFile.id;
        console.log(`[UploadModal] Thought collection file uploaded, fileId: ${thoughtFileId}`);

        // Generate thumbnails for each page using renderTextPostToBlob
        const { renderTextPostToBlob } = await import('../services/textPostService');
        const thumbnailFileIds: string[] = [];
        const thumbnailTokens: Record<string, string> = {};
        const baseFileName = metadata.name || 'thought-collection';
        
        // Helper function to extract title from content (same as single thoughts)
        const getFirstLine = (text: string): string => {
          // Remove HTML tags if present
          const textWithoutHtml = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
          // Get first line (split by newline or <br>)
          const lines = textWithoutHtml.split(/\n|<br\s*\/?>/i);
          const firstLine = lines[0] || textWithoutHtml;
          // Trim and limit length
          return firstLine.trim().substring(0, 100);
        };
        
        // Extract subjects helper (will be imported and used per page)
        const { extractSubjects } = await import('../utils/subjectExtractor');
        
        // Generate thumbnail for each page - using same exact flow as single thoughts
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          let thumbnailFileId: string | undefined = undefined;
          let thumbnailShareToken: any = undefined;
          
          try {
            // Generate full-size PNG thumbnail (1080x1080) - this is what users see in feeds (same as single thoughts)
            console.log(`[UploadModal] Rendering thumbnail for page ${i + 1}/${pages.length} at scale 1.0 (1080x1080)`);
            const thumbnailBlob = await renderTextPostToBlob(page, 1.0);
            console.log(`[UploadModal] Thumbnail blob size: ${thumbnailBlob.size} bytes`);
            
            // Encrypt thumbnail (same as single thoughts)
            const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
            const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
            const encryptedThumbnail = await encryptionManager.encrypt(
              thumbnailData,
              session.did,
              publicKey
            );
            
            // Create encrypted thumbnail package (same as single thoughts)
            const thumbnailPackage: EncryptedFilePackage = {
              encrypted: encryptedThumbnail.encrypted,
              iv: encryptedThumbnail.iv,
              salt: encryptedThumbnail.salt,
              metadata: {
                originalName: `thumb_${baseFileName}-page-${i + 1}.png`,
                originalSize: thumbnailBlob.size,
                originalMimeType: 'image/png',
              },
            };
            
            // Generate share token for thumbnail (same as single thoughts - BEFORE upload)
            try {
              const encryptionService = getEncryptionService();
              thumbnailShareToken = await encryptionService.generateShareToken(
                thumbnailPackage,
                {
                  id: session.did,
                  publicKey: publicKey
                }
              );
              console.log(`✅ [UploadModal] Thumbnail share token generated successfully for page ${i + 1}`);
            } catch (tokenError: any) {
              console.error(`❌ [UploadModal] Thumbnail share token generation failed for page ${i + 1}:`, tokenError?.message || tokenError);
              thumbnailShareToken = undefined;
            }
            
            // Convert to base64 (same as single thoughts)
            const thumbnailBlobJson = new Blob([JSON.stringify(thumbnailPackage)], {
              type: 'application/json',
            });
            
            const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                resolve(result.includes(',') ? result.split(',')[1] : result);
              };
              reader.onerror = () => reject(new Error('Failed to read thumbnail'));
              reader.readAsDataURL(thumbnailBlobJson);
            });
            
            // Upload encrypted thumbnail (same as single thoughts)
            const thumbnailFileName = `thumb_${baseFileName}-page-${i + 1}.png.encrypted`;
            const thumbnailUploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
              },
              body: JSON.stringify({
                fileData: thumbnailBase64,
                fileName: thumbnailFileName,
                mimeType: 'application/json',
                accountId: accountId
              })
            });
            
            if (thumbnailUploadResponse.ok) {
              const thumbnailResult = await thumbnailUploadResponse.json();
              thumbnailFileId = thumbnailResult.file?.id;
              if (thumbnailFileId) {
                console.log(`✅ [UploadModal] Thumbnail uploaded successfully for page ${i + 1}, thumbnailFileId: ${thumbnailFileId}`);
              }
            } else {
              const errorText = await thumbnailUploadResponse.text().catch(() => 'Unknown error');
              console.warn(`⚠️ [UploadModal] Thumbnail upload failed for page ${i + 1}, continuing without thumbnail:`, errorText);
            }
          } catch (thumbnailError: any) {
            console.error(`❌ [UploadModal] Thumbnail generation/upload failed for page ${i + 1}:`, thumbnailError);
            // Continue without thumbnail for this page
          }
          
          if (thumbnailFileId) {
            // Store share token for this thumbnail
            if (thumbnailShareToken) {
              thumbnailTokens[thumbnailFileId] = JSON.stringify(thumbnailShareToken);
            }
            
            // Extract title from page content (same as single thoughts)
            const titleFromContent = getFirstLine(page.content || '');
            
            // Extract subjects from page content and metadata (same as single thoughts)
            const subjects = extractSubjects(
              metadata?.description || page.content,
              metadata?.tags || [],
              metadata?.keywords || []
            );
            
            // Create metadata for thumbnail (private, only collection shows)
            // Use same exact flow and standards as single thought thumbnails
            try {
              const thumbnailPublicToken = thumbnailShareToken ? JSON.stringify(thumbnailShareToken) : undefined;
              
              await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${thumbnailFileId}?accountId=${accountId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                  name: `thumb_${baseFileName}-page-${i + 1}.png`,
                  title: metadata?.title || titleFromContent || 'Thought',
                  // No description - thoughts don't show captions by default (can be added later via metadata edit)
                  keywords: metadata?.keywords || [],
                  tags: metadata?.tags || [],
                  // Use different fileType for thumbnails of collection thoughts vs single thoughts
                  fileType: 'thought-collection-thumbnail', // Explicit fileType for filtering
                  isPublic: false, // Private if part of collection (like PDF page thumbnails)
                  uploadDate: new Date().toISOString(),
                  isNSFW: metadata?.isNSFW || false,
                  // Mark as thought thumbnail so UI knows to render title only (no caption)
                  isThoughtThumbnail: true,
                  // Mark if part of collection (for filtering)
                  isPartOfCollection: true,
                  // Store reference to main file for editing
                  mainFileId: thoughtFileId, // Reference to JSON file for editing
                  publicToken: thumbnailPublicToken,
                  feedCategories: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords : undefined,
                  category: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords[0] : undefined,
                  subjects: subjects.length > 0 ? subjects : undefined,
                })
              });
              
              console.log(`✅ [UploadModal] Thumbnail metadata created for page ${i + 1}`);
            } catch (err) {
              console.warn(`[UploadModal] Failed to create metadata for thumbnail page ${i + 1}:`, err);
            }
            
            thumbnailFileIds.push(thumbnailFileId);
            console.log(`[UploadModal] Generated thumbnail for page ${i + 1}/${pages.length}`);
          }
        }
        
        // Create metadata for the thought collection file (private, for editing)
        await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${thoughtFileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            name: metadata.name || baseFileName,
            title: metadata.name || baseFileName,
            description: metadata.description || '',
            keywords: metadata.keywords || metadata.tags || [],
            tags: metadata.tags || metadata.keywords || [],
            fileType: 'thought-collection', // New fileType for thought collections
            isPublic: false, // Private - only collection shows
            isNSFW: false,
            publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
            uploadDate: new Date().toISOString(),
            textPost: thoughtCollectionData.textPost, // Store the full thought data with pages array
            thought: thoughtCollectionData.textPost, // Alias for compatibility
          }),
        });
        
        // Create collection from thumbnails
        if (thumbnailFileIds.length > 0) {
          const collectionResult = await createCollection(
            {
              collectionFileIds: thumbnailFileIds,
              title: metadata.name || baseFileName,
              thumbnailTokens: thumbnailTokens
            },
            accountId,
            {
              title: metadata.name || baseFileName,
              description: metadata.description || '',
              keywords: metadata.keywords || metadata.tags || [],
              tags: metadata.tags || metadata.keywords || [],
              isPublic: true, // Collection is public
              isNSFW: false,
              isThoughtCollection: true // Mark as thought collection
            }
          );
          
          if (collectionResult.success) {
            console.log(`[UploadModal] Created collection with ${thumbnailFileIds.length} pages`);
          } else {
            console.warn('[UploadModal] Failed to create collection:', collectionResult.error);
          }
        }
        
        setShowTextEditor(false);
        if (onUploadComplete) {
          onUploadComplete();
        }
        setTimeout(() => {
          onClose();
        }, 500);
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
