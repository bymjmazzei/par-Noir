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
import { createTextPost, convertThoughtPagesToPDF } from '../services/textPostService';
import { createCollection } from '../services/collectionService';
import { PNOAuthService } from '../services/pnOAuthService';
import { FeedService } from '../services/feedService';
import { Settings } from 'lucide-react';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../services/encryptionService';

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
        // Multi-page thought: convert to PDF, process pages, upload, then create collection
        const pages = (textPost as any).pages as TextPostData[];
        const metadata = textPost.metadata || {};
        
        console.log(`[UploadModal] Converting ${pages.length} thought pages to PDF`);
        
        // Convert thought pages to PDF
        const pdfBlob = await convertThoughtPagesToPDF(pages);
        
        // Create File object from PDF blob
        const pdfFileName = `${metadata.name || 'Thought Collection'}.pdf`;
        const pdfFile = new File([pdfBlob], pdfFileName, { type: 'application/pdf' });
        
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

        // Process PDF pages to create thumbnails (like FileStorageAggregator does)
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        const pdfThumbnailFileIds: string[] = [];
        const pdfThumbnailTokens: Record<string, string> = {};
        const baseFileName = pdfFile.name.replace(/\.pdf$/i, '');
        
        console.log(`[UploadModal] Processing ${numPages} PDF pages...`);
        
        // Helper to upload thumbnail
        const uploadThumbnail = async (thumbnailBlob: Blob, originalFileName: string): Promise<string | undefined> => {
          try {
            const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
            const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
            const encryptedThumbnail = await encryptionManager.encrypt(thumbnailData, session.did, publicKey);
            
            const thumbnailPackage = {
              encrypted: encryptedThumbnail.encrypted,
              iv: encryptedThumbnail.iv,
              salt: encryptedThumbnail.salt,
              metadata: {
                originalName: `thumb_${originalFileName}`,
                originalSize: thumbnailBlob.size,
                originalMimeType: 'image/jpeg',
              },
            };
            
            const thumbnailBlobJson = new Blob([JSON.stringify(thumbnailPackage)], { type: 'application/json' });
            const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                resolve(result.includes(',') ? result.split(',')[1] : result);
              };
              reader.onerror = () => reject(new Error('Failed to read thumbnail'));
              reader.readAsDataURL(thumbnailBlobJson);
            });
            
            const thumbnailFileName = `thumb_${originalFileName}.encrypted`;
            const thumbnailResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
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
            
            if (thumbnailResponse.ok) {
              const thumbnailResult = await thumbnailResponse.json();
              return thumbnailResult.file?.id;
            }
            return undefined;
          } catch (error: any) {
            console.error('[UploadModal] Thumbnail upload failed:', error);
            return undefined;
          }
        };
        
        // Process each PDF page
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          const scale = Math.min(800 / viewport.width, 800 / viewport.height, 1.0);
          const scaledViewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          
          await page.render({ canvasContext: ctx, viewport: scaledViewport } as any).promise;
          
          const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to create blob')), 'image/jpeg', 0.85);
          });
          
          const thumbnailFileName = `${baseFileName}-page-${pageNum}.png`;
          const thumbnailFileId = await uploadThumbnail(thumbnailBlob, thumbnailFileName);
          
          if (thumbnailFileId) {
            // Generate share token for thumbnail
            try {
              const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
              const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
              const encryptedThumbnail = await encryptionManager.encrypt(thumbnailData, session.did, publicKey);
              const thumbnailPackage = {
                encrypted: encryptedThumbnail.encrypted,
                iv: encryptedThumbnail.iv,
                salt: encryptedThumbnail.salt,
                metadata: {
                  originalName: `thumb_${thumbnailFileName}`,
                  originalSize: thumbnailBlob.size,
                  originalMimeType: 'image/jpeg',
                },
              };
              
              const encryptionService = getEncryptionService();
              const thumbnailShareToken = await encryptionService.generateShareToken(thumbnailPackage, {
                id: session.did,
                publicKey: publicKey
              });
              
              pdfThumbnailTokens[thumbnailFileId] = JSON.stringify(thumbnailShareToken);
              
              // Create metadata for thumbnail
              await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${thumbnailFileId}?accountId=${accountId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                  name: `thumb_${thumbnailFileName}`,
                  fileType: 'image',
                  isPublic: false,
                  publicToken: JSON.stringify(thumbnailShareToken)
                })
              });
            } catch (err) {
              console.warn(`[UploadModal] Failed to process thumbnail for page ${pageNum}:`, err);
            }
            
            pdfThumbnailFileIds.push(thumbnailFileId);
            console.log(`[UploadModal] Processed page ${pageNum}/${numPages}`);
          }
        }
        
        // Upload PDF file
        const fileArrayBuffer = await pdfFile.arrayBuffer();
        const fileData = new Uint8Array(fileArrayBuffer);
        const encrypted = await encryptionManager.encrypt(fileData, session.did, publicKey);
        
        const packageData = {
          encrypted: encrypted.encrypted,
          iv: encrypted.iv,
          salt: encrypted.salt,
          metadata: {
            originalName: pdfFile.name,
            originalSize: pdfFile.size,
            originalMimeType: 'application/pdf',
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
        
        const encryptedFileName = `${pdfFile.name}.encrypted`;
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
        
        const fileId = uploadedFile.id;
        console.log(`[UploadModal] PDF uploaded successfully, fileId: ${fileId}`);
        
        // Create metadata for PDF
        await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            name: metadata.name || pdfFileName.replace('.pdf', ''),
            title: metadata.name || pdfFileName.replace('.pdf', ''),
            description: metadata.description || '',
            keywords: metadata.keywords || metadata.tags || [],
            tags: metadata.tags || metadata.keywords || [],
            fileType: 'document',
            isPublic: false, // PDF file itself is private
            isNSFW: false,
            publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
            uploadDate: new Date().toISOString(),
          }),
        });
        
        // Create collection from thumbnails
        if (pdfThumbnailFileIds.length > 0) {
          const collectionResult = await createCollection(
            {
              collectionFileIds: pdfThumbnailFileIds,
              title: metadata.name || pdfFileName.replace('.pdf', ''),
              thumbnailTokens: pdfThumbnailTokens
            },
            accountId,
            {
              title: metadata.name || pdfFileName.replace('.pdf', ''),
              description: metadata.description || '',
              keywords: metadata.keywords || metadata.tags || [],
              tags: metadata.tags || metadata.keywords || [],
              isPublic: true,
              isNSFW: false
            }
          );
          
          if (collectionResult.success) {
            console.log(`[UploadModal] Created collection with ${pdfThumbnailFileIds.length} pages`);
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
