/**
 * File Storage Aggregator Component (Browser App)
 * Uses API endpoints instead of direct Google Drive access
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, File, RefreshCw, AlertCircle, Lock, Globe, X, Edit, Eye, Grid, List, Plus, Cloud, MoreVertical, Share2, Star, Type, Upload, Minus, Trash2 } from 'lucide-react';
import { PNOAuthService } from '../services/pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from '../services/encryptionService';
import { FEED_CATEGORIES, FEED_CATEGORY_LIST } from '../constants/feedCategories';
import { LICENSE_TYPES } from '../constants/licenses';
import { FeedCategory } from '../types/aggregator';
import { useUserState } from '../contexts/UserStateContext';
import { cleanTitle } from '../utils/cleanTitle';

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

// Thumbnail component that handles authenticated loading
const ThumbnailImage: React.FC<{ fileId: string; accountId: string; fileName: string; alt: string; className?: string; mimeType?: string; mainFileId?: string; isThumbnail?: boolean }> = ({ fileId, accountId, fileName, alt, className = 'w-full h-full object-cover', mimeType, mainFileId, isThumbnail }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // Check if file is encrypted
  // Note: Files uploaded through the dashboard are stored with .encrypted extension
  // But they're actually JSON packages, so we check the extension
  const isEncrypted = fileName.toLowerCase().endsWith('.encrypted');
  
  useEffect(() => {
    let blobUrl: string | null = null;
    
    const loadThumbnail = async () => {
      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          console.warn('[ThumbnailImage] No access token available');
          setError(true);
          return;
        }

        // Check if this is a PDF slideshow folder (folder ending with "-pages")
        const nameWithoutEncrypted = fileName.replace(/\.encrypted$/i, '');
        const isPDFSlideshowFolder = mimeType === 'application/vnd.google-apps.folder' && nameWithoutEncrypted.toLowerCase().endsWith('-pages');
        
        // For PDF slideshow folders, get the first PNG page as thumbnail
        if (isPDFSlideshowFolder) {
          try {
            // List files in folder and get the first PNG page
            const folderQuery = `'${fileId}' in parents and trashed=false`;
            const filesUrl = `${apiEndpoint}/api/drive/files?q=${encodeURIComponent(folderQuery)}&pageSize=1000${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`;
            
            const folderResponse = await fetch(filesUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (folderResponse.ok) {
              const folderData = await folderResponse.json();
              const files = folderData.files || [];
              
              // Find the first PNG page (sorted by page number)
              const pageFiles = files
                .map((f: any) => {
                  const match = f.name.match(/-page-(\d+)\.png\.encrypted$/i);
                  if (match) {
                    return { ...f, pageNum: parseInt(match[1], 10) };
                  }
                  return null;
                })
                .filter((f: any) => f !== null)
                .sort((a: any, b: any) => a.pageNum - b.pageNum);
              
              if (pageFiles.length > 0) {
                // Use the first page as thumbnail
                const firstPageId = pageFiles[0].id;
                const thumbnailUrl = `${apiEndpoint}/api/drive/files/${firstPageId}?accountId=${encodeURIComponent(accountId)}&thumbnail=true`;
                
                const thumbResponse = await fetch(thumbnailUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (thumbResponse.ok) {
                  const thumbBlob = await thumbResponse.blob();
                  const url = URL.createObjectURL(thumbBlob);
                  setThumbnailUrl(url);
                  setError(false);
                  return;
                }
              }
            }
          } catch (folderError: any) {
            // Fall through to regular handling
          }
        }

        // Check if this is a thought file or thought thumbnail - if so, render directly from HTML/CSS content
        const fileNameWithoutEncrypted = fileName.replace(/\.encrypted$/i, '');
        const isThoughtFile = fileNameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                              (fileNameWithoutEncrypted.toLowerCase().endsWith('.thought') || fileNameWithoutEncrypted.toLowerCase().endsWith('.png'));
        const isThoughtThumbnail = fileNameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') && 
                                   (fileNameWithoutEncrypted.toLowerCase().endsWith('.thought') || fileNameWithoutEncrypted.toLowerCase().endsWith('.png'));
        const isThought = isThoughtFile || isThoughtThumbnail;
        
        // If this is a thought thumbnail entry, try to render from the main thought file
        // Check if fileName is a thought thumbnail (starts with thumb_thought-)
        // IMPORTANT: This must come BEFORE the regular encrypted file handling to prevent fallthrough
        if (isThoughtFile || isThoughtThumbnail) {
          // For thought thumbnails, use mainFileId to get the actual thought file
          // For thought files, use fileId directly
          const thoughtFileId = isThoughtThumbnail ? mainFileId : fileId;
          
          if (!thoughtFileId) {
            console.warn('[ThumbnailImage] Thought missing fileId/mainFileId, cannot render', { isThoughtThumbnail, mainFileId, fileId, fileName });
            setError(true);
            return;
          }
          
          try {
            console.log('[ThumbnailImage] Rendering thought from fileId:', thoughtFileId, 'isThumbnail:', isThoughtThumbnail, 'fileName:', fileName);
            // Load and decrypt the actual thought file (not the thumbnail file)
            const session = PNOAuthService.loadSession();
            if (!session?.did) {
              console.warn('[ThumbnailImage] No session available for thought thumbnail');
              setError(true);
              return;
            }
            
            const pnId = session.did;
            let publicKey = session?.publicKey;
            if (!publicKey && session.did.startsWith('did:key:')) {
              publicKey = session.did.substring(8);
            }
            if (!publicKey) {
              console.warn('[ThumbnailImage] No publicKey available for thought thumbnail');
              setError(true);
              return;
            }
            
            // Download the thought file
            const thoughtFileUrl = `${apiEndpoint}/api/drive/files/${thoughtFileId}?accountId=${accountId}&download=true`;
            console.log('[ThumbnailImage] Downloading thought file from:', thoughtFileUrl);
            const thoughtResponse = await fetch(thoughtFileUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });

            if (!thoughtResponse.ok) {
              console.warn('[ThumbnailImage] Failed to download thought file:', thoughtResponse.status, thoughtResponse.statusText);
              setError(true);
              return;
            }

            const { EncryptionManager } = await import('../utils/encryptionManager');
            const encryptedText = await thoughtResponse.text();
            const encryptedPackage = JSON.parse(encryptedText);
            const encryptionManager = new EncryptionManager();
            const decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );

            // Parse the thought data
            const decryptedText = new TextDecoder().decode(decryptedData);
            const thoughtData = JSON.parse(decryptedText);
            const textPost = thoughtData.textPost;

            if (!textPost) {
              console.warn('[ThumbnailImage] Thought file missing textPost data:', thoughtData);
              setError(true);
              return;
            }

            console.log('[ThumbnailImage] Rendering thought at thumbnail size...');
            // Render thought at thumbnail size (scale factor ~0.3 for ~300px thumbnails)
            const { renderTextPostToBlob } = await import('../services/textPostService');
            const THUMBNAIL_SIZE = 300;
            const scaleFactor = THUMBNAIL_SIZE / 1080; // Scale relative to original 1080px width
            const thumbnailBlob = await renderTextPostToBlob(textPost, scaleFactor);
            const url = URL.createObjectURL(thumbnailBlob);
            console.log('[ThumbnailImage] Thought thumbnail rendered successfully');
            setThumbnailUrl(url);
            setError(false);
            return;
          } catch (thoughtError: any) {
            // For thoughts, if rendering fails, show error (don't try to load as image)
            console.error('[ThumbnailImage] Thought rendering error:', thoughtError?.message || thoughtError, thoughtError);
            setError(true);
            return;
          }
        }
        
        // Check if this is a PDF file - if so, try to use thumbnailFileId from metadata first
        // Note: Skip this for thought thumbnails (isThoughtThumbnail) as they should render from thought content
        const isPDF = /\.pdf$/i.test(fileNameWithoutEncrypted);
        if ((isPDF || (isThought && !isThoughtThumbnail)) && isEncrypted && !isThumbnail) {
          try {
            // Try to get thumbnailFileId from metadata
            const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              const thumbnailFileId = metadata.metadata?.thumbnailFileId || metadata.thumbnailFileId;
              
              if (thumbnailFileId) {
                // Use the thumbnail file directly
                const thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailFileId}?thumbnail=true${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`;
                const thumbResponse = await fetch(thumbnailUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (thumbResponse.ok) {
                  const contentType = thumbResponse.headers.get('content-type') || '';
                  const blob = await thumbResponse.blob();
                  
                  // Decrypt if encrypted
                  if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                    const session = PNOAuthService.loadSession();
                    if (session?.did) {
                      const pnId = session.did;
                      let publicKey = session?.publicKey;
                      if (!publicKey && session.did.startsWith('did:key:')) {
                        publicKey = session.did.substring(8);
                      }
                      if (publicKey) {
                        const { EncryptionManager } = await import('../utils/encryptionManager');
                        const encryptedText = await blob.text();
                        const encryptedPackage = JSON.parse(encryptedText);
                        const encryptionManager = new EncryptionManager();
                        const decryptedData = await encryptionManager.decrypt(
                          encryptedPackage.encrypted,
                          encryptedPackage.iv,
                          encryptedPackage.salt,
                          pnId,
                          publicKey
                        );
                        const decryptedBlob = new Blob([decryptedData], {
                          type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                        });
                        const url = URL.createObjectURL(decryptedBlob);
                        setThumbnailUrl(url);
                        setError(false);
                        return;
                      }
                    }
                  } else {
                    const url = URL.createObjectURL(blob);
                    setThumbnailUrl(url);
                    setError(false);
                    return;
                  }
                }
              }
            }
          } catch (metadataError) {
            // Fall through to regular handling
          }
        }

        // Skip regular encrypted file handling for thought files and thought thumbnails - they should render from thought content
        if (isEncrypted && !isThoughtFile && !isThoughtThumbnail) {
          // For encrypted files: download, decrypt, and generate thumbnail
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            setError(true);
            return;
          }

          const pnId = session.did;
          let publicKey = session?.publicKey;
          
          // If publicKey is missing, try to refresh it from userinfo
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
          
          // Fallback: extract from DID if it's in did:key format
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8);
          }
          
          if (!publicKey) {
            setError(true);
            return;
          }

          // Download encrypted file (it's stored as JSON string)
          const fileUrl = `${apiEndpoint}/api/drive/files/${fileId}?accountId=${accountId}&download=true`;
          
          const response = await fetch(fileUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!response.ok) {
            throw new Error(`Failed to download file: ${response.status}`);
          }

          // Encrypted files are stored as JSON strings, so read as text first
          const encryptedText = await response.text();
          
          let encryptedPackage: EncryptedFilePackage;
          
          try {
            encryptedPackage = JSON.parse(encryptedText);
          } catch (parseError) {
            throw new Error('File is not a valid encrypted package');
          }
          
          // Decrypt file
          const encryptionManager = new EncryptionManager();
          let decryptedData: Uint8Array;
          
          try {
            decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
          } catch (decryptError: any) {
            throw decryptError;
          }

          // Create thumbnail from decrypted blob
          const decryptedBlob = new Blob([decryptedData], {
            type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
          });
          
          // Check if it's a PDF
          const isPDF = encryptedPackage.metadata.originalMimeType === 'application/pdf' || 
                       encryptedPackage.metadata.originalName.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            const thumbnailBlob = await createPDFThumbnail(decryptedBlob, 300, 300);
            blobUrl = URL.createObjectURL(thumbnailBlob);
            setThumbnailUrl(blobUrl);
            setError(false);
          } else {
            // Double-check: Don't try to create thumbnail from blob if this is a thought file
            // Thought files contain JSON text, not image data
            // Only check originalName - don't check mimeType because encrypted files are always JSON packages
            const originalName = encryptedPackage.metadata.originalName?.toLowerCase() || '';
            const isThoughtFileCheck = originalName.startsWith('thought-') && 
                                     (originalName.endsWith('.thought') || originalName.endsWith('.png')) ||
                                     fileNameWithoutEncrypted.toLowerCase().startsWith('thought-') ||
                                     fileNameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
            
            if (isThoughtFileCheck) {
              console.warn('[ThumbnailImage] Skipping thumbnail creation for thought file - should use renderTextPostToBlob');
              setError(true);
              return;
            }
            
            try {
              const thumbnailBlob = await createThumbnailFromBlob(decryptedBlob, 300, 300);
              blobUrl = URL.createObjectURL(thumbnailBlob);
              setThumbnailUrl(blobUrl);
              setError(false);
            } catch (thumbnailError: any) {
              console.error('[ThumbnailImage] Failed to create thumbnail from blob:', thumbnailError?.message || thumbnailError);
              // Try to use the decrypted blob directly as a fallback
              try {
                blobUrl = URL.createObjectURL(decryptedBlob);
                setThumbnailUrl(blobUrl);
                setError(false);
              } catch (fallbackError: any) {
                console.error('[ThumbnailImage] Fallback also failed:', fallbackError?.message || fallbackError);
                setError(true);
              }
            }
          }
        } else {
          // Non-encrypted files: try to load thumbnail from Google Drive, fallback to downloading full file
          const thumbnailUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true&accountId=${accountId}`;
          
          let response = await fetch(thumbnailUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const blob = await response.blob();
            blobUrl = URL.createObjectURL(blob);
            setThumbnailUrl(blobUrl);
            setError(false);
          } else {
            // Fallback: download full file and generate thumbnail client-side
            const downloadUrl = `${apiEndpoint}/api/drive/files/${fileId}?accountId=${accountId}&download=true`;
            
            response = await fetch(downloadUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });

            if (response.ok) {
              const fileBlob = await response.blob();
              
              // Check if it's an image, video, or PDF
              const mimeType = fileBlob.type || '';
              const isImage = mimeType.startsWith('image/');
              const isVideo = mimeType.startsWith('video/');
              const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
              
              if (isPDF) {
                // Generate PDF thumbnail (first page)
                const thumbnailBlob = await createPDFThumbnail(fileBlob, 300, 300);
                blobUrl = URL.createObjectURL(thumbnailBlob);
                setThumbnailUrl(blobUrl);
                setError(false);
              } else if (isImage || isVideo) {
                // Generate thumbnail from the full file
                try {
                  const thumbnailBlob = await createThumbnailFromBlob(fileBlob, 300, 300);
                  blobUrl = URL.createObjectURL(thumbnailBlob);
                  setThumbnailUrl(blobUrl);
                  setError(false);
                } catch (thumbnailError: any) {
                  console.error('[ThumbnailImage] Failed to create thumbnail from file blob:', thumbnailError?.message || thumbnailError);
                  // Try to use the file blob directly as a fallback
                  try {
                    blobUrl = URL.createObjectURL(fileBlob);
                    setThumbnailUrl(blobUrl);
                    setError(false);
                  } catch (fallbackError: any) {
                    console.error('[ThumbnailImage] Fallback also failed:', fallbackError?.message || fallbackError);
                    setError(true);
                  }
                }
              } else {
                setError(true);
              }
            } else {
              setError(true);
            }
          }
        }
      } catch (err) {
        console.error('[ThumbnailImage] Failed to load thumbnail:', err);
        setError(true);
      }
    };

    loadThumbnail();

    // Cleanup blob URL on unmount or when fileId/accountId changes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
      // Also cleanup thumbnailUrl from state if it's a blob URL
      setThumbnailUrl(prev => {
        if (prev && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
    };
  }, [fileId, accountId, isEncrypted, fileName, mainFileId, isThumbnail]);

// Helper function to create PDF thumbnail (first page)
async function createPDFThumbnail(blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    // Ensure worker is set (should already be set globally, but set as fallback)
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }
    
    // Convert blob to ArrayBuffer for PDF.js (avoids blob URL XHR issues)
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Use data directly instead of URL to avoid blob URL XHR issues
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;
    
    // Get first page
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Calculate scale to fit max dimensions
    const scale = Math.min(maxWidth / viewport.width, maxHeight / viewport.height, 1.0);
    const scaledViewport = page.getViewport({ scale });
    
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    
    // Render PDF page to canvas
    await page.render({
      canvasContext: ctx,
      viewport: scaledViewport
    }).promise;
    
    // Convert canvas to blob
    return new Promise((resolve, reject) => {
      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) {
          resolve(thumbnailBlob);
        } else {
          reject(new Error('Failed to create PDF thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    });
  } catch (error) {
    throw new Error(`Failed to create PDF thumbnail: ${error}`);
  }
}

// Helper function to create thumbnail from blob
async function createThumbnailFromBlob(blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) {
          resolve(thumbnailBlob);
        } else {
          reject(new Error('Failed to create thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };
    
    img.src = url;
  });
}

/**
 * Generate thumbnail from video by extracting first frame
 */
async function createVideoThumbnail(videoFile: File, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(videoFile);
    
    video.onloadedmetadata = () => {
      // Seek to 1 second or first frame
      video.currentTime = Math.min(1, video.duration / 2);
    };
    
    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      // Calculate dimensions maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, width, height);
      
      canvas.toBlob((thumbnailBlob) => {
        URL.revokeObjectURL(url);
        if (thumbnailBlob) {
          resolve(thumbnailBlob);
        } else {
          reject(new Error('Failed to create video thumbnail blob'));
        }
      }, 'image/jpeg', 0.8);
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for thumbnail'));
    };
    
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
  });
}

/**
 * Upload encrypted thumbnail file
 */
async function uploadThumbnail(
  thumbnailBlob: Blob,
  originalFileName: string,
  encryptionManager: EncryptionManager,
  session: any,
  publicKey: string,
  accessToken: string,
  accountId: string
): Promise<string | undefined> {
  try {
    console.log('🖼️ [Upload] Generating thumbnail...');
    
    // Encrypt thumbnail
    const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
    const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
    const encryptedThumbnail = await encryptionManager.encrypt(
      thumbnailData,
      session.did,
      publicKey
    );
    
    // Create encrypted thumbnail package
    const thumbnailPackage: EncryptedFilePackage = {
      encrypted: encryptedThumbnail.encrypted,
      iv: encryptedThumbnail.iv,
      salt: encryptedThumbnail.salt,
      metadata: {
        originalName: `thumb_${originalFileName}`,
        originalSize: thumbnailBlob.size,
        originalMimeType: 'image/jpeg', // Thumbnails are always JPEG
      },
    };
    
    // Convert to base64
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
    
    // Upload encrypted thumbnail
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
      const thumbnailFileId = thumbnailResult.file?.id;
      if (thumbnailFileId) {
        console.log('✅ [Upload] Thumbnail uploaded:', thumbnailFileId);
        return thumbnailFileId;
      }
    }
    
    console.warn('⚠️ [Upload] Thumbnail upload failed, continuing without thumbnail');
    return undefined;
  } catch (error: any) {
    console.error('❌ [Upload] Thumbnail generation/upload failed:', error);
    return undefined;
  }
}

  if (error || !thumbnailUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Lock className="h-8 w-8 text-blue-400" />
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt={alt}
      className={className}
      onError={() => setError(true)}
    />
  );
};

// File viewer component that handles authenticated file loading
const FileViewer: React.FC<{ file: DriveFile; accountId: string; onDownload: () => void }> = ({ file, accountId, onDownload }) => {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Determine file type from name (for encrypted files, check original extension)
  const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
  const isImage = file.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
  const isVideo = file.mimeType?.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
  const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');

  useEffect(() => {
    const loadFile = async () => {
      try {
        setLoading(true);
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setError(true);
          setLoading(false);
          return;
        }

        const fileUrl = `${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}&download=true`;
        const response = await fetch(fileUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[FileViewer] Failed to load file: ${response.status} - ${errorText}`);
          setError(true);
          setLoading(false);
          return;
        }

        if (isEncrypted) {
          // Decrypt encrypted file
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            setError(true);
            setLoading(false);
            return;
          }

          const pnId = session.did;
          let publicKey = session?.publicKey;
          
          // If publicKey is missing, try to refresh it from userinfo
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
          
          // Fallback: extract from DID if it's in did:key format
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8);
          }
          
          if (!publicKey) {
            setError(true);
            setLoading(false);
            return;
          }

          // Encrypted files are stored as JSON strings, so read as text first
          const encryptedText = await response.text();
          
          let encryptedPackage: EncryptedFilePackage;
          
          try {
            encryptedPackage = JSON.parse(encryptedText);
          } catch (parseError) {
            throw new Error('File is not a valid encrypted package');
          }
          
          // Decrypt file
          const encryptionManager = new EncryptionManager();
          let decryptedData: Uint8Array;
          
          try {
            decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
          } catch (decryptError: any) {
            throw decryptError;
          }

          // Create blob from decrypted data
          const originalMimeType = encryptedPackage.metadata?.originalMimeType || file.mimeType || 'application/octet-stream';
          const decryptedBlob = new Blob([decryptedData], {
            type: originalMimeType
          });

          const url = URL.createObjectURL(decryptedBlob);
          setFileUrl(url);
          setError(false);
        } else {
          // Non-encrypted file: use directly
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setFileUrl(url);
        }
      } catch (err) {
        console.error('[FileViewer] Failed to load file:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (isImage || isVideo) {
      loadFile();
    } else {
      setLoading(false);
    }

    // Cleanup blob URL on unmount
    return () => {
      if (fileUrl) {
        URL.revokeObjectURL(fileUrl);
      }
    };
  }, [file.id, file.name, accountId, isImage, isVideo, isEncrypted]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (error || !fileUrl) {
    return (
      <div className="text-center text-white">
        <Lock className="h-16 w-16 mx-auto mb-4 text-blue-400" />
        <p className="mb-2 text-lg font-semibold">
          {isEncrypted ? 'Encrypted File' : 'Preview not available'}
        </p>
        <p className="mb-4 text-sm text-gray-400">
          {isEncrypted 
            ? 'This file is encrypted and must be downloaded to view.' 
            : 'This file cannot be previewed in the browser.'}
        </p>
        <button
          onClick={onDownload}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Download File
        </button>
      </div>
    );
  }

  if (isImage) {
    return (
      <img
        src={fileUrl}
        alt={file.name}
        className="max-w-full max-h-full object-contain"
        style={{ 
          filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))'
        }}
      />
    );
  }

  if (isVideo) {
    return (
      <video
        src={fileUrl}
        controls
        className="max-w-full max-h-full"
      />
    );
  }

  return (
    <div className="text-center text-white">
      <p className="mb-4">Preview not available for this file type</p>
      <button
        onClick={onDownload}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Download File
      </button>
    </div>
  );
};

interface DriveAccount {
  provider: string;
  accountId: string;
  email?: string;
  displayName?: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  webViewLink?: string;
  modifiedTime?: string;
  isPublic?: boolean;
  accountId?: string; // Track which account this file belongs to
  mainFileId?: string; // ID of the main file (if this is a thumbnail)
  isThumbnail?: boolean; // Whether this file is a thumbnail
}

interface FileStorageAggregatorProps {
  authenticatedUser?: {
    id: string;
    pnName?: string;
    publicKey?: string;
    nickname?: string;
    accessToken?: string;
  } | null;
  hideSecureFolderSection?: boolean;
  onOpenTextEditor?: (accountId: string) => void;
}

export const FileStorageAggregator: React.FC<FileStorageAggregatorProps> = ({ 
  authenticatedUser, 
  hideSecureFolderSection = false,
  onOpenTextEditor
}) => {
  const { userState } = useUserState();
  const [isLoading, setIsLoading] = useState(false);
  const [filesByAccount, setFilesByAccount] = useState<Map<string, DriveFile[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [driveAccounts, setDriveAccounts] = useState<DriveAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [viewingFile, setViewingFile] = useState<DriveFile | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [showAddMenuFor, setShowAddMenuFor] = useState<string | null>(null);
  const [addMenuPosition, setAddMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const fileInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const addButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Load cloud accounts
  useEffect(() => {
    const loadAccounts = async () => {
      console.log('[FileStorageAggregator] loadAccounts called', { 
        hasAuthenticatedUser: !!authenticatedUser,
        authenticatedUserId: authenticatedUser?.id,
        userStateUnlocked: userState.isUnlocked,
        userStatePnIdentifier: userState.pnIdentifier
      });
      
      if (!authenticatedUser?.id) {
        console.log('[FileStorageAggregator] No authenticatedUser.id, clearing accounts');
        setDriveAccounts([]);
        return;
      }

      try {
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          console.error('[FileStorageAggregator] No valid access token');
          return;
        }

        console.log('[FileStorageAggregator] Fetching accounts from:', `${apiEndpoint}/api/storage/accounts/${authenticatedUser.id}`);
        const response = await fetch(`${apiEndpoint}/api/storage/accounts/${authenticatedUser.id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        console.log('[FileStorageAggregator] Accounts response:', { status: response.status, ok: response.ok });
        
        if (response.ok) {
          const data = await response.json();
          const accounts = data.accounts || [];
          console.log('[FileStorageAggregator] Loaded accounts:', accounts.length);
          setDriveAccounts(accounts);
          if (accounts.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accounts[0].accountId);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[FileStorageAggregator] Failed to load accounts:', response.status, errorText);
        }
      } catch (err) {
        console.error('[FileStorageAggregator] Failed to load accounts:', err);
      }
    };

    loadAccounts();
  }, [authenticatedUser?.id, selectedAccountId, userState.isUnlocked, userState.pnIdentifier]);

  // Load files for a specific account
  const loadFilesForAccount = async (accountId: string) => {
    if (!authenticatedUser?.id) {
      return;
    }

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        setError('Please connect your pN to view files');
        return;
      }

      // Server will automatically filter to files in the pN folder if no query is provided
      const response = await fetch(`${apiEndpoint}/api/drive/files?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        // Token might be invalid, try refreshing (force refresh even if not expired)
        // Force refresh the token
        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
        if (!refreshedToken) {
          setError('Your session has expired. Please unlock your pN again to continue.');
          return;
        }
        
        // Retry with refreshed token
        const retryResponse = await fetch(`${apiEndpoint}/api/drive/files?accountId=${accountId}`, {
          headers: {
            'Authorization': `Bearer ${refreshedToken}`
          }
        });
        
        if (!retryResponse.ok) {
          const errorText = await retryResponse.text().catch(() => 'Unknown error');
          throw new Error(`Failed to load files: ${retryResponse.statusText} - ${errorText}`);
        }
        
        const retryData = await retryResponse.json();
        const allFiles = (retryData.files || []).map((file: DriveFile) => ({
          ...file,
          accountId,
          displayName: file.name.replace(/\.encrypted$/i, '')
        }));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} files from API, checking for folders...`);
        const folders = allFiles.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
        console.log(`[FileStorageAggregator] Found ${folders.length} folders:`, folders.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        console.log(`[FileStorageAggregator] All files:`, allFiles.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        
        // Separate thumbnails and main files
        const thumbnails = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thumb_') && name.endsWith('.encrypted');
        });
        
        const mainFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return !name.startsWith('thumb_');
        });
        
        // Filter out PDF page thumbnails (thumb_*-page-*.png.encrypted) - these are part of PDF slideshows
        const regularThumbnails = thumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return !/^thumb_.+-page-\d+\.png\.encrypted$/i.test(name);
        });
        
        // Separate thought thumbnails from regular thumbnails
        const thoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return name.startsWith('thumb_thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'));
        });
        
        const nonThoughtThumbnails = regularThumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return !name.startsWith('thumb_thought-');
        });
        
        // Map regular (non-thought) thumbnails to their main files and create display entries
        const thumbnailEntries = nonThoughtThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find main file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          
          // Find the corresponding main file
          const mainFile = mainFiles.find((mf: DriveFile) => {
            const mainFileName = mf.name.replace(/\.encrypted$/i, '');
            return mainFileName === thumbNameWithoutPrefix;
          });
          
          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');
          
          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: mainFile?.id || thumb.id, // Use main file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });
        
        // Map thought thumbnails to thought files
        const thoughtFiles = mainFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'));
        });
        
        const thoughtThumbnailEntries = thoughtThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find thought file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          
          // Find the corresponding thought file
          const thoughtFile = thoughtFiles.find((tf: DriveFile) => {
            const thoughtFileName = tf.name.replace(/\.encrypted$/i, '');
            return thoughtFileName === thumbNameWithoutPrefix;
          });
          
          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');
          
          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: thoughtFile?.id || thumb.id, // Use thought file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });
        
        // Filter to show thumbnails (representing main files), PDF files (for slideshows), and thought thumbnails
        const mediaFiles = thumbnailEntries.concat(thoughtThumbnailEntries).concat(
          allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Include PDF files (they represent slideshows with pdfPageThumbnailIds)
          if (name.endsWith('.pdf.encrypted')) {
            return true; // Include PDF files (they'll show as slideshows in the feed)
          }
          
          // Include thoughts that don't have thumbnails (legacy thoughts)
          if (name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'))) {
            // Check if this thought has a thumbnail
            const thoughtNameWithoutExt = name.replace(/\.encrypted$/i, '');
            const hasThumbnail = thoughtThumbnails.some((thumb: DriveFile) => {
              const thumbNameWithoutExt = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
              return thumbNameWithoutExt === thoughtNameWithoutExt;
            });
            // Only include thoughts without thumbnails (legacy thoughts)
            return !hasThumbnail;
          }
          
          // Exclude everything else (main files already have thumbnails, PDF page thumbnails are hidden)
          return false;
        })
        );
        
        setFilesByAccount(prev => {
          const next = new Map(prev);
          next.set(accountId, mediaFiles);
          return next;
        });
        setError(null); // Clear any previous errors
        return;
      }

      if (response.ok) {
        const data = await response.json();
        const allFiles = (data.files || []).map((file: DriveFile) => ({
          ...file,
          accountId, // Tag each file with its account ID
          // Store original name for display (remove .encrypted suffix)
          displayName: file.name.replace(/\.encrypted$/i, '')
        }));
        
        console.log(`[FileStorageAggregator] Loaded ${allFiles.length} files from API, checking for folders...`);
        const folders = allFiles.filter((f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder');
        console.log(`[FileStorageAggregator] Found ${folders.length} folders:`, folders.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        console.log(`[FileStorageAggregator] All files:`, allFiles.map((f: DriveFile) => ({ name: f.name, id: f.id, mimeType: f.mimeType })));
        
        // Separate thumbnails and main files
        const thumbnails = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return name.startsWith('thumb_') && name.endsWith('.encrypted');
        });
        
        const mainFiles = allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          return !name.startsWith('thumb_');
        });
        
        // Filter out PDF page thumbnails (thumb_*-page-*.png.encrypted) - these are part of PDF slideshows
        const regularThumbnails = thumbnails.filter((thumb: DriveFile) => {
          const name = thumb.name.toLowerCase();
          return !/^thumb_.+-page-\d+\.png\.encrypted$/i.test(name);
        });
        
        // Map regular thumbnails to their main files and create display entries
        const thumbnailEntries = regularThumbnails.map((thumb: DriveFile) => {
          // Remove "thumb_" prefix and ".encrypted" suffix to find main file
          const thumbNameWithoutPrefix = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          
          // Find the corresponding main file
          const mainFile = mainFiles.find((mf: DriveFile) => {
            const mainFileName = mf.name.replace(/\.encrypted$/i, '');
            return mainFileName === thumbNameWithoutPrefix;
          });
          
          // Clean display name: remove thumb_ prefix and file extension
          let displayName = thumb.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          // Remove file extension
          displayName = displayName.replace(/\.[^.]+$/, '');
          
          return {
            ...thumb,
            isThumbnail: true,
            mainFileId: mainFile?.id || thumb.id, // Use main file ID if found, fallback to thumb ID
            displayName: displayName
          };
        });
        
        // Filter to show thumbnails (representing main files), PDF files (for slideshows), and thoughts
        const mediaFiles = thumbnailEntries.concat(
          allFiles.filter((file: DriveFile) => {
          const name = file.name.toLowerCase();
          const mimeType = file.mimeType || '';
          
          // Include PDF files (they represent slideshows with pdfPageThumbnailIds)
          if (name.endsWith('.pdf.encrypted')) {
            return true; // Include PDF files (they'll show as slideshows in the feed)
          }
          
          // Include thoughts (they don't have thumbnails, show the thought file itself)
          // Support both new .thought format and legacy .png format
          if (name.startsWith('thought-') && (name.endsWith('.thought.encrypted') || name.endsWith('.png.encrypted'))) {
            return true;
          }
          
          // Exclude everything else (main files already have thumbnails, PDF page thumbnails are hidden)
          return false;
        })
        );
        
        setFilesByAccount(prev => {
          const next = new Map(prev);
          next.set(accountId, mediaFiles);
          return next;
        });
        setError(null); // Clear any previous errors
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[FileStorageAggregator] Request failed (${response.status}):`, errorText);
        throw new Error(`Failed to load files: ${response.statusText} - ${errorText}`);
      }
    } catch (err: any) {
      console.error('[FileStorageAggregator] Failed to load files:', err);
      // Only set error if it's a real error, not just empty files
      if (err.message && !err.message.includes('No valid access token')) {
        setError(err.message || 'Failed to load files');
      }
    }
  };

  // Load files for all accounts
  useEffect(() => {
    if (driveAccounts.length > 0 && authenticatedUser?.id) {
      // Load files for each account sequentially to avoid race conditions
      const loadAllFiles = async () => {
        setIsLoading(true);
        setError(null); // Clear previous errors
        try {
          for (const account of driveAccounts) {
            try {
              await loadFilesForAccount(account.accountId);
            } catch (err) {
              // Log error but continue loading other accounts
              console.error(`[FileStorageAggregator] Failed to load files for account ${account.accountId}:`, err);
            }
          }
        } finally {
          setIsLoading(false);
        }
      };
      loadAllFiles();
    }
  }, [driveAccounts.length, authenticatedUser?.id]);


  // Handle file download
  const handleDownload = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Use main file ID if this is a thumbnail, otherwise use file ID
      const fileIdToDownload = file.mainFileId || file.id;
      
      // Get the original filename for download
      let downloadFileName = file.name;
      if (file.isThumbnail) {
        // For thumbnails, try to get the original filename from metadata
        try {
          const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileIdToDownload}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (metadataResponse.ok) {
            const metadata = await metadataResponse.json();
            if (metadata.metadata?.name) {
              downloadFileName = metadata.metadata.name;
            } else {
              // Fallback: reconstruct from display name (add back extension if we can infer it)
              downloadFileName = file.displayName || file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
            }
          } else {
            // Fallback: reconstruct from display name
            downloadFileName = file.displayName || file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
          }
        } catch (metadataError) {
          // Fallback: reconstruct from display name
          downloadFileName = file.displayName || file.name.replace(/^thumb_/i, '').replace(/\.encrypted$/i, '');
        }
      }

      const response = await fetch(`${apiEndpoint}/api/drive/files/${fileIdToDownload}?accountId=${accountId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = downloadFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        throw new Error('Failed to download file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to download file');
      console.error('[FileStorageAggregator] Download error:', err);
    }
  };

  // Edit Metadata state
  const [editingFile, setEditingFile] = useState<DriveFile | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    tags: string;
    genre: string;
    category: FeedCategory | '';
    locationName: string;
    locationAddress: string;
    license: string;
  }>({
    name: '',
    description: '',
    tags: '',
    genre: '',
    category: '',
    locationName: '',
    locationAddress: '',
    license: 'all-rights-reserved'
  });
  const [fileMetadataMap, setFileMetadataMap] = useState<Map<string, any>>(new Map());

  // Share Settings state
  const [sharingFile, setSharingFile] = useState<DriveFile | null>(null);
  const [sharingAccountId, setSharingAccountId] = useState<string | null>(null);
  const [shareVisibility, setShareVisibility] = useState<'public' | 'private'>('private');
  const [shareNSFW, setShareNSFW] = useState<boolean>(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [thirdPartyIndexers, setThirdPartyIndexers] = useState<any[]>([]);
  const [indexerToggles, setIndexerToggles] = useState<Record<string, boolean>>({});
  const [indexingPermissionsState, setIndexingPermissionsState] = useState<any>(null);
  const [isLoadingIndexers, setIsLoadingIndexers] = useState(false);
  const [indexerError, setIndexerError] = useState<string | null>(null);

  // Load file metadata
  const loadFileMetadata = async (fileId: string) => {
    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return null;

      const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const metadata = await response.json();
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          next.set(fileId, metadata.metadata || metadata);
          return next;
        });
        return metadata.metadata || metadata;
      } else if (response.status === 404) {
        // Metadata doesn't exist yet, return null
        return null;
      }
    } catch (err) {
      console.error('[FileStorageAggregator] Failed to load metadata:', err);
    }
    return null;
  };

  // Load third-party indexers
  const loadThirdPartyIndexers = async (fileId: string) => {
    setIsLoadingIndexers(true);
    setIndexerError(null);
    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        setThirdPartyIndexers([]);
        return;
      }

      // Get current index visibility
      const visibilityResponse = await fetch(`${apiEndpoint}/api/third-party/files/${encodeURIComponent(fileId)}/index-visibility`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (visibilityResponse.ok) {
        const visibilityData = await visibilityResponse.json();
        setIndexingPermissionsState(visibilityData.indexingPermissions || null);

        // Load available indexers (simplified - in production this would come from a separate endpoint)
        // For now, we'll use a static list or derive from permissions
        const indexers: any[] = [];
        if (visibilityData.indexers) {
          indexers.push(...visibilityData.indexers);
        }

        setThirdPartyIndexers(indexers);

        // Initialize toggles based on permissions
        if (visibilityData.indexingPermissions) {
          const toggles: Record<string, boolean> = {};
          indexers.forEach(indexer => {
            if (visibilityData.indexingPermissions.mode === 'all') {
              toggles[indexer.id] = !visibilityData.indexingPermissions.blocked?.includes(indexer.id);
            } else {
              toggles[indexer.id] = visibilityData.indexingPermissions.allowed?.includes(indexer.id) || false;
            }
          });
          setIndexerToggles(toggles);
        }
      }
    } catch (err) {
      console.error('[FileStorageAggregator] Failed to load indexers:', err);
      setIndexerError('Failed to load third-party indexers');
    } finally {
      setIsLoadingIndexers(false);
    }
  };

  // Handle edit metadata
  const handleEditMetadata = async (file: DriveFile, accountId: string) => {
    
    // Load existing metadata
    const metadata = await loadFileMetadata(file.id);
    
    // Extract location data if present
    const location = metadata?.locationCreated || metadata?.schema?.locationCreated;
    const locationName = location?.name || '';
    const locationAddress = location?.address ? 
      `${location.address.addressLocality || ''}${location.address.addressRegion ? ', ' + location.address.addressRegion : ''}${location.address.addressCountry ? ', ' + location.address.addressCountry : ''}`.trim() : '';
    
    // Extract genre (can be array or string)
    const genre = metadata?.genre || metadata?.schema?.genre || [];
    const genreString = Array.isArray(genre) ? genre.join(', ') : (typeof genre === 'string' ? genre : '');
    
    // Extract category (prefer feedCategories, fallback to category)
    const feedCategories = metadata?.feedCategories || [];
    const category = feedCategories.length > 0 ? feedCategories[0] : (metadata?.category || '');
    
    // Extract license (can be object with name or string)
    const license = metadata?.license || metadata?.schema?.license || '';
    const licenseString = typeof license === 'object' && license?.name ? license.name : (typeof license === 'string' ? license : '') || 'all-rights-reserved';
    
    setEditForm({
      name: metadata?.name || (file.name.endsWith('.encrypted') ? file.name.replace('.encrypted', '') : file.name),
      description: metadata?.description || '',
      tags: (metadata?.keywords || metadata?.tags || []).join(', '),
      genre: genreString,
      category: category as FeedCategory | '',
      locationName: locationName,
      locationAddress: locationAddress,
      license: licenseString
    });
    setEditingFile(file);
  };

  // Handle save metadata
  const handleSaveMetadata = async () => {
    if (!editingFile) return;

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      // Parse tags from comma-separated string
      const tags = editForm.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Parse genre from comma-separated string
      const genre = editForm.genre
        .split(',')
        .map(g => g.trim())
        .filter(g => g.length > 0);

      // Extract subjects from description, tags, and keywords
      const { extractSubjects } = await import('../utils/subjectExtractor');
      const subjects = extractSubjects(
        editForm.description,
        tags,
        tags // keywords same as tags
      );

      // Validate required category
      if (!editForm.category) {
        setError('Category is required');
        setIsLoading(false);
        return;
      }

      // Build location object if provided (without lat/lng)
      let locationCreated = undefined;
      if (editForm.locationName || editForm.locationAddress) {
        locationCreated = {
          '@type': 'Place',
          ...(editForm.locationName && { name: editForm.locationName }),
          ...(editForm.locationAddress && {
            address: {
              '@type': 'PostalAddress',
              addressLocality: editForm.locationAddress.split(',')[0]?.trim() || '',
              addressRegion: editForm.locationAddress.split(',')[1]?.trim() || '',
              addressCountry: editForm.locationAddress.split(',')[2]?.trim() || ''
            }
          })
        };
      }

      // Update via API endpoint
      const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${editingFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          keywords: tags,
          tags: tags,
          genre: genre.length > 0 ? genre : undefined,
          feedCategories: editForm.category ? [editForm.category as FeedCategory] : undefined,
          category: editForm.category || undefined,
          locationCreated: locationCreated,
          license: editForm.license || undefined,
          subjects: subjects.length > 0 ? subjects : undefined
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update metadata: ${errorText}`);
      }

      const updatedMetadata = await response.json();
      
      // Update local metadata map
      setFileMetadataMap(prev => {
        const next = new Map(prev);
        next.set(editingFile.id, updatedMetadata.metadata || updatedMetadata);
        return next;
      });

      // Update displayName in file list if name was changed
      if (editingFile.accountId) {
        setFilesByAccount(prev => {
          const next = new Map(prev);
          const accountFiles = next.get(editingFile.accountId) || [];
          const updatedFiles = accountFiles.map(file => {
            if (file.id === editingFile.id) {
              return {
                ...file,
                displayName: editForm.name || (file.name.endsWith('.encrypted') ? file.name.replace('.encrypted', '') : file.name)
              };
            }
            return file;
          });
          next.set(editingFile.accountId, updatedFiles);
          return next;
        });
      }

      // Reload files to ensure metadata is fresh
      if (editingFile.accountId) {
        await loadFilesForAccount(editingFile.accountId);
      }

      setEditingFile(null);
      setEditForm({
        name: '',
        description: '',
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        license: '',
        isNSFW: false
      });
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update metadata';
      setError(errorMessage);
      console.error('[FileStorageAggregator] Failed to save metadata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle share settings
  const handleShareSettings = async (file: DriveFile, accountId: string) => {
    
    // Load existing metadata to determine current visibility
    const metadata = await loadFileMetadata(file.id);
    const isPublic = metadata?.isPublic || false;
    const isNSFW = metadata?.isNSFW === true;
    const hasPublicToken = metadata?.publicToken && 
                          typeof metadata.publicToken === 'string' && 
                          metadata.publicToken.trim().length > 0;
    
    
    setShareVisibility(isPublic ? 'public' : 'private');
    
    // Load third-party indexers if public
    if (isPublic) {
      await loadThirdPartyIndexers(file.id);
    }
    
    setSharingFile(file);
    setSharingAccountId(accountId);
    setShareNSFW(isNSFW);
  };

  // Close share settings
  const closeShareSettings = () => {
    setSharingFile(null);
    setSharingAccountId(null);
    setShareVisibility('private');
    setShareNSFW(false);
    setThirdPartyIndexers([]);
    setIndexerToggles({});
    setIndexingPermissionsState(null);
    setIndexerError(null);
  };

  // Handle indexer toggle
  const handleIndexerToggle = (indexerId: string) => {
    setIndexerToggles((prev) => {
      const next = { ...prev };
      next[indexerId] = !prev[indexerId];
      return next;
    });
  };

  // Handle save share settings
  const handleSaveShareSettings = async () => {
    if (!sharingFile) return;

    try {
      setIsSavingShare(true);
      setError(null);

      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }

      const existingMetadata = fileMetadataMap.get(sharingFile.id);
      const targetFileId = existingMetadata?.fileId || sharingFile.id;
      const isCurrentlyPublic = existingMetadata?.isPublic || false;
      const existingIsNSFW = existingMetadata?.isNSFW === true;
      const makePublic = shareVisibility === 'public';

      const blockedIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => !enabled)
        .map(([id]) => id);
      const enabledIds = Object.entries(indexerToggles)
        .filter(([, enabled]) => enabled)
        .map(([id]) => id);

      let nextPermissions: any = null;
      if (thirdPartyIndexers.length > 0) {
        if (blockedIds.length === 0) {
          nextPermissions = {
            mode: 'all',
            blocked: [],
            allowed: enabledIds,
            updatedAt: new Date().toISOString()
          };
        } else if (blockedIds.length === thirdPartyIndexers.length) {
          nextPermissions = {
            mode: 'none',
            blocked: [...blockedIds],
            allowed: [],
            updatedAt: new Date().toISOString()
          };
        } else {
          nextPermissions = {
            mode: 'all',
            blocked: [...blockedIds],
            allowed: enabledIds,
            updatedAt: new Date().toISOString()
          };
        }
      } else if (indexingPermissionsState) {
        nextPermissions = {
          ...indexingPermissionsState,
          updatedAt: new Date().toISOString()
        };
      }

      // Check if file needs token generation (either making public OR already public but missing token)
      const existingPublicToken = existingMetadata?.publicToken;
      const hasValidToken = existingPublicToken && 
                            typeof existingPublicToken === 'string' && 
                            existingPublicToken.trim().length > 0;
      const isPublicAfterUpdate = makePublic || isCurrentlyPublic;
      const needsTokenGeneration = isPublicAfterUpdate && !hasValidToken;
      
      // Update if visibility changed OR if token needs to be generated
      if (makePublic !== isCurrentlyPublic || needsTokenGeneration) {
        let publicToken: string | undefined = undefined;
        
        // Generate share token if making public OR if already public but missing token
        if (needsTokenGeneration) {
          try {
            // Check if this is a PDF slideshow folder (folders can't be downloaded)
            const isPDFSlideshowFolder = sharingFile?.mimeType === 'application/vnd.google-apps.folder' && 
                                         (sharingFile?.name || '').toLowerCase().endsWith('-pages');
            
            if (isPDFSlideshowFolder) {
              // For folders, create a special share token that references the folder ID
              // The viewer will know to list files in the folder instead of downloading
              console.log('📁 [ShareSettings] Generating share token for PDF slideshow folder:', targetFileId);
              
              const session = PNOAuthService.loadSession();
              if (session?.did && session?.publicKey) {
                // Create a minimal share token structure for folders
                // The folder itself doesn't need encryption - the PNG files inside are already encrypted
                const folderShareToken = {
                  fileId: targetFileId,
                  folderId: targetFileId, // Same as fileId for folders
                  type: 'folder-slideshow', // Indicates this is a folder-based slideshow
                  permissions: ['read'],
                  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year expiry
                  createdBy: session.did
                };
                publicToken = JSON.stringify(folderShareToken);
                console.log('✅ [ShareSettings] Generated folder share token');
              } else {
                console.warn('⚠️ [ShareSettings] Missing session data for folder token generation');
              }
            } else {
              // Regular file - download and generate share token as usual
            const downloadResponse = await fetch(
              `${apiEndpoint}/api/drive/files/${targetFileId}?accountId=${encodeURIComponent(sharingAccountId || '')}&download=true`,
              {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            );

            if (downloadResponse.ok) {
              const fileBlob = await downloadResponse.blob();
              const contentType = downloadResponse.headers.get('content-type') || '';
              
              
              // Encrypted files are stored as JSON, so parse as text
              const fileText = await fileBlob.text();
              
              if (!fileText || fileText.trim().length === 0) {
                throw new Error('Downloaded file is empty');
              }
              
              // Parse encrypted file package (JSON format)
              let encryptedPackage: EncryptedFilePackage;
              try {
                encryptedPackage = JSON.parse(fileText);
              } catch (parseError: any) {
                console.error('❌ [ShareSettings] Failed to parse encrypted file package:', {
                  error: parseError?.message,
                  fileTextPreview: fileText.substring(0, 200)
                });
                throw new Error(`Failed to parse encrypted file: ${parseError?.message}`);
              }
              
              // Validate package structure
              if (!encryptedPackage.encrypted || !encryptedPackage.iv || !encryptedPackage.salt) {
                throw new Error('Invalid encrypted file package structure - missing required fields');
              }
              
              // Get user session for token generation
              const session = PNOAuthService.loadSession();
              if (session?.did && session?.publicKey) {
                const encryptionService = getEncryptionService();
                const shareToken = await encryptionService.generateShareToken(
                  encryptedPackage,
                  {
                    id: session.did,
                    publicKey: session.publicKey
                  }
                );
                publicToken = JSON.stringify(shareToken);
              } else {
                console.warn('⚠️ [ShareSettings] Missing session data for token generation');
              }
            } else {
              console.warn('⚠️ [ShareSettings] Failed to download file for token generation:', downloadResponse.status);
              }
            }
          } catch (tokenError: any) {
            console.error('❌ [ShareSettings] Failed to generate share token:', tokenError);
            // Don't fail the request - file can be made public without token (will need to be regenerated later)
          }
        }
        
        // Update metadata - either toggle public status OR regenerate token for existing public file
        const accountIdParam = sharingAccountId ? `?accountId=${encodeURIComponent(sharingAccountId)}` : '';
        const updateBody: any = {};
        
        if (makePublic !== isCurrentlyPublic) {
          updateBody.isPublic = makePublic;
        }
        
        // ALWAYS update NSFW status if file is public (whether making public or already public)
        // This ensures NSFW status is always persisted for public files
        if (makePublic || isCurrentlyPublic) {
          updateBody.isNSFW = shareNSFW;
        } else if (shareNSFW !== existingIsNSFW) {
          // File is private - only update if changed
          updateBody.isNSFW = shareNSFW;
        }
        
        // Always include publicToken if we have one (newly generated or existing)
        // This ensures the API has the token for public files
        if (publicToken) {
          updateBody.publicToken = publicToken;
          console.log('📤 [ShareSettings] Sending publicToken to API:', {
            hasToken: !!publicToken,
            tokenLength: publicToken.length,
            isNewToken: !hasValidToken
          });
        } else if (hasValidToken && existingPublicToken) {
          // If file already has a token, preserve it by sending it to API
          updateBody.publicToken = existingPublicToken;
        } else if (makePublic) {
          console.warn('⚠️ [ShareSettings] Making file public but no publicToken available - file may not load in public feed');
        }
        
        const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${targetFileId}${accountIdParam}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify(updateBody),
        });
        
        if (!metadataResponse.ok) {
          const errorText = await metadataResponse.text().catch(() => 'Unknown error');
          console.error('❌ [ShareSettings] API update failed:', errorText);
          throw new Error(`Failed to update file visibility: ${errorText}`);
        }

        if (!metadataResponse.ok) {
          throw new Error('Failed to update file visibility');
        }

        // Reload metadata
        await loadFileMetadata(sharingFile.id);
        
        // If making file public, wait a moment for API to update owner/public indexes
        // Then reload files to reflect the change in the UI
        if (makePublic && sharingAccountId) {
          console.log('🔄 [ShareSettings] Waiting for API to update indexes...');
          // Give API time to update owner index and public index
          await new Promise(resolve => setTimeout(resolve, 2000));
          await loadFilesForAccount(sharingAccountId);
        }
      }

      // Update index visibility if public and permissions changed
      if (makePublic && nextPermissions) {
        const response = await fetch(
          `${apiEndpoint}/api/third-party/files/${encodeURIComponent(targetFileId)}/index-visibility`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              indexingPermissions: nextPermissions
            })
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          throw new Error(errorText || `Failed to update index visibility (${response.status})`);
        }
      }

      // Update local metadata map
      if (makePublic || nextPermissions || shareNSFW !== existingMetadata?.isNSFW) {
        setFileMetadataMap(prev => {
          const next = new Map(prev);
          const current = next.get(sharingFile.id);
          if (current) {
            next.set(sharingFile.id, {
              ...current,
              isPublic: makePublic,
              isNSFW: shareNSFW,
              ...(nextPermissions && { indexingPermissions: nextPermissions })
            });
          } else {
            // If metadata doesn't exist locally, create it
            next.set(sharingFile.id, {
              fileId: sharingFile.id,
              isPublic: makePublic,
              isNSFW: shareNSFW,
              ...(nextPermissions && { indexingPermissions: nextPermissions })
            } as any);
          }
          return next;
        });
      }

      closeShareSettings();
    } catch (err: any) {
      const message = err instanceof Error ? err.message : 'Failed to update sharing settings';
      setError(message);
      console.error('[FileStorageAggregator] Failed to save share settings:', err);
    } finally {
      setIsSavingShare(false);
    }
  };

  // Handle file delete
  const handleDelete = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      const response = await fetch(`${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        // Cleanup: The file will be removed from indexedFiles which will trigger thumbnail cleanup
        // But we also need to clean up any local blob URLs created by ThumbnailImage components
        // This happens automatically when components unmount, but we can force cleanup here
        
        await loadFilesForAccount(accountId); // Reload files for this account
        setOpenMenuFor(null);
      } else {
        throw new Error('Failed to delete file');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete file');
      console.error('[FileStorageAggregator] Delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async (accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;
    
    // Get files to delete for this account only
    const accountFiles = filesByAccount.get(accountId) || [];
    const filesToDelete = accountFiles.filter(file => selectedFiles.has(file.id));
    
    if (filesToDelete.length === 0) return;
    
    const fileCount = filesToDelete.length;
    if (!confirm(`Are you sure you want to delete ${fileCount} file${fileCount > 1 ? 's' : ''}?`)) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Delete files sequentially
      let successCount = 0;
      let failCount = 0;
      
      for (const file of filesToDelete) {
        try {
          const response = await fetch(`${apiEndpoint}/api/drive/files/${file.id}?accountId=${accountId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
            console.error(`[FileStorageAggregator] Failed to delete file ${file.id}:`, response.statusText);
          }
        } catch (err: any) {
          failCount++;
          console.error(`[FileStorageAggregator] Error deleting file ${file.id}:`, err);
        }
      }

      // Reload files after bulk delete
      await loadFilesForAccount(accountId);
      
      // Clear selection and exit bulk delete mode
      setSelectedFiles(new Set());
      setIsBulkDeleteMode(false);
      
      if (failCount > 0) {
        setError(`Deleted ${successCount} file${successCount !== 1 ? 's' : ''}, ${failCount} failed`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete files');
      console.error('[FileStorageAggregator] Bulk delete error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  // Select all files in current account
  const selectAllFiles = (accountId: string) => {
    const accountFiles = filesByAccount.get(accountId) || [];
    const accountFilesIds = accountFiles.map(f => f.id);
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      accountFilesIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
  };

  // Handle set/unset top post
  const handleSetTopPost = async (file: DriveFile, accountId: string) => {
    if (!authenticatedUser?.id || !accountId) return;

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Get current metadata to check if already top post
      const metadata = fileMetadataMap.get(file.id);
      const currentIsTopPost = metadata?.isTopPost || false;
      const newIsTopPost = !currentIsTopPost;

      const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${file.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isTopPost: newIsTopPost
        })
      });

      if (response.ok) {
        // Update local metadata
        const updatedMetadata = { ...metadata, isTopPost: newIsTopPost };
        setFileMetadataMap(prev => new Map(prev).set(file.id, updatedMetadata));
        setOpenMenuFor(null);
      } else {
        const errorText = await response.text();
        throw new Error(`Failed to update top post: ${errorText}`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to set top post');
      console.error('[FileStorageAggregator] Set top post error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load metadata for files when menu opens
  useEffect(() => {
    if (openMenuFor) {
      // Load metadata for the file when menu opens
      loadFileMetadata(openMenuFor).catch(err => {
        console.warn('[FileStorageAggregator] Failed to load metadata for menu:', err);
      });
    }
  }, [openMenuFor]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuFor) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is on the menu button itself
      const menuButton = document.querySelector(`[data-menu-button="${openMenuFor}"]`);
      if (menuButton && (menuButton.contains(target) || menuButton === target)) {
        return; // Don't close if clicking the button
      }
      
      // Check if click is inside the menu
      if (actionMenuRef.current && actionMenuRef.current.contains(target)) {
        return; // Don't close if clicking inside menu
      }
      
      // Close menu if clicking outside
      setOpenMenuFor(null);
    };

    // Use a delay to avoid immediate closure from the button click
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [openMenuFor]);

  // Close add menu when clicking outside
  useEffect(() => {
    if (!showAddMenuFor) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is on the add button itself
      const addButton = addButtonRefs.current.get(showAddMenuFor);
      if (addButton && (addButton.contains(target) || addButton === target)) {
        return; // Don't close if clicking the button
      }
      
      // Check if click is inside the menu (find by checking if it's in a menu element)
      const menuElement = document.querySelector(`[data-add-menu="${showAddMenuFor}"]`);
      if (menuElement && menuElement.contains(target)) {
        return; // Don't close if clicking inside menu
      }
      
      // Close menu if clicking outside
      setShowAddMenuFor(null);
      setAddMenuPosition(null);
    };

    // Use a delay to avoid immediate closure from the button click
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside, true);
    }, 200);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showAddMenuFor]);

  const hasConnectedBackends = driveAccounts.length > 0;

  // Thumbnail generation helpers (defined inside component to ensure scope)
  const createThumbnailFromBlobLocal = async (blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((thumbnailBlob) => {
          if (thumbnailBlob) {
            resolve(thumbnailBlob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for thumbnail'));
      };
      
      img.src = url;
    });
  };

  const createVideoThumbnailLocal = async (videoFile: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(videoFile);
      
      video.onloadedmetadata = () => {
        // Seek to 1 second or first frame
        video.currentTime = Math.min(1, video.duration / 2);
      };
      
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        // Calculate dimensions maintaining aspect ratio
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        ctx.drawImage(video, 0, 0, width, height);
        
        canvas.toBlob((thumbnailBlob) => {
          URL.revokeObjectURL(url);
          if (thumbnailBlob) {
            resolve(thumbnailBlob);
          } else {
            reject(new Error('Failed to create video thumbnail blob'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video for thumbnail'));
      };
      
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = url;
    });
  };

  const uploadThumbnailLocal = async (
    thumbnailBlob: Blob,
    originalFileName: string,
    encryptionManager: EncryptionManager,
    session: any,
    publicKey: string,
    accessToken: string,
    accountId: string
  ): Promise<string | undefined> => {
    try {
      // Encrypt thumbnail
      const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
      const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
      const encryptedThumbnail = await encryptionManager.encrypt(
        thumbnailData,
        session.did,
        publicKey
      );
      
      // Create encrypted thumbnail package
      const thumbnailPackage: EncryptedFilePackage = {
        encrypted: encryptedThumbnail.encrypted,
        iv: encryptedThumbnail.iv,
        salt: encryptedThumbnail.salt,
        metadata: {
          originalName: `thumb_${originalFileName}`,
          originalSize: thumbnailBlob.size,
          originalMimeType: 'image/jpeg', // Thumbnails are always JPEG
        },
      };
      
      // Convert to base64
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
      
      // Upload encrypted thumbnail
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
        const thumbnailFileId = thumbnailResult.file?.id;
        if (thumbnailFileId) {
          return thumbnailFileId;
        }
      }
      
      return undefined;
    } catch (error: any) {
      console.error('[Upload] Thumbnail generation/upload failed:', error);
      return undefined;
    }
  };

  const handleUploadForAccount = async (accountId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }
    
    if (!authenticatedUser?.id) {
      setError('Please unlock your pN to upload files');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No valid access token');
      }

      // Get session for encryption (need DID and publicKey)
      const session = PNOAuthService.loadSession();
      if (!session?.did) {
        throw new Error('No DID in session for encryption');
      }

      let publicKey = session?.publicKey;
      
      // If publicKey is missing, try to refresh it from userinfo
      if (!publicKey && session.accessToken) {
        try {
          const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
          if (userInfo.public_key) {
            publicKey = userInfo.public_key;
            // Update session with publicKey
            const updatedSession = { ...session, publicKey };
            PNOAuthService.saveSession(updatedSession);
          }
        } catch (err) {
          // Silent fail - will throw error below if still missing
        }
      }
      
      if (!publicKey) {
        throw new Error('No publicKey available for encryption. Please unlock your pN.');
      }

      console.log('📤 [Upload] Starting upload...', { fileName: file.name, fileSize: file.size });

      // Initialize encryption manager (needed for PDF conversion)
      const encryptionManager = new EncryptionManager();

      // Check if this is a PDF - if so, convert to PNG pages first
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      let pdfPageThumbnailIds: string[] = []; // Array of thumbnail file IDs (loaded directly, no folder listing)
      let pdfPageThumbnailTokens: string[] = []; // Array of publicToken for each thumbnail (same order as pdfPageThumbnailIds) - NO API CALLS!
      
      if (isPDF) {
        console.log('📄 [Upload] PDF detected, converting to PNG pages...');
        try {
          // CRITICAL: Read pnIdentifier directly from session at upload time, not from React state
          // React closures can capture stale state values, so we need to read fresh from session
          const currentSession = PNOAuthService.loadSession();
          let pnIdentifier = currentSession?.pnIdentifier;
          
          // Debug logging
          console.log('🔍 [Upload] Checking pnIdentifier:', {
            session_pnIdentifier: currentSession?.pnIdentifier,
            session_did: currentSession?.did,
            userState_pnIdentifier: userState.pnIdentifier,
            userState_isUnlocked: userState.isUnlocked
          });
          
          // If session doesn't have pnIdentifier or it's a DID, throw error
          if (!pnIdentifier) {
            console.error('❌ [Upload] No pnIdentifier in session');
            throw new Error('No pnIdentifier available in session. Please reconnect your pN.');
          }
          
          // Validate that we have a pnIdentifier, not a DID
          if (pnIdentifier.startsWith('did:key:')) {
            console.error('❌ [Upload] Session pnIdentifier is a DID:', pnIdentifier);
            throw new Error('Session pnIdentifier is still a DID. Please reconnect your pN to get the correct identifier.');
          }
          
          console.log('✅ [Upload] Using pnIdentifier from session:', pnIdentifier);
          const baseFileName = file.name.replace(/\.pdf$/i, '');
          
          // Now convert PDF to PNG pages
          const pdfjsLib = await import('pdfjs-dist');
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          }
          
          // Load PDF
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdf = await loadingTask.promise;
          
          const numPages = pdf.numPages;
          console.log(`📄 [Upload] PDF has ${numPages} pages, generating thumbnails...`);
          
          // Generate thumbnails for each page (only thumbnails, not full-size PNGs)
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            try {
              // Refresh access token before each upload to prevent expiration
              const freshAccessToken = await PNOAuthService.getValidAccessToken();
              if (!freshAccessToken) {
                console.warn(`⚠️ [Upload] No access token for page ${pageNum}, skipping thumbnail generation`);
                break; // Stop conversion if we can't get a token
              }
              
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.0 });
              
              // Calculate thumbnail scale (800px max width/height)
              const scale = Math.min(800 / viewport.width, 800 / viewport.height);
              const thumbnailViewport = page.getViewport({ scale });
              
              // Render to canvas at thumbnail size
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (!context) {
                console.warn(`⚠️ [Upload] Failed to get canvas context for page ${pageNum}`);
                continue;
              }
              
              canvas.width = thumbnailViewport.width;
              canvas.height = thumbnailViewport.height;
              
              await page.render({
                canvasContext: context,
                viewport: thumbnailViewport
              }).promise;
              
              // Convert canvas to JPEG blob (thumbnail only, not PNG)
              const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob((blob) => {
                  if (blob) resolve(blob);
                  else reject(new Error('Failed to convert canvas to blob'));
                }, 'image/jpeg', 0.8); // JPEG for smaller file size
              });
              
              // Encrypt thumbnail
              const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
              const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
              const thumbnailEncrypted = await encryptionManager.encrypt(
                thumbnailData,
                session.did,
                publicKey
              );
              
              // Create encrypted package for thumbnail
              const thumbnailPackage: EncryptedFilePackage = {
                encrypted: thumbnailEncrypted.encrypted,
                iv: thumbnailEncrypted.iv,
                salt: thumbnailEncrypted.salt,
                metadata: {
                  originalName: `thumb_${baseFileName}-page-${pageNum}.png`,
                  originalSize: thumbnailBlob.size,
                  originalMimeType: 'image/jpeg', // Thumbnails are JPEG
                },
              };
              
              // Generate share token for thumbnail (optional, don't fail if it doesn't work)
              let thumbnailShareToken: any = undefined;
              try {
                const encryptionService = getEncryptionService();
                thumbnailShareToken = await encryptionService.generateShareToken(
                  thumbnailPackage,
                  {
                    id: session.did,
                    publicKey: publicKey
                  }
                );
              } catch (tokenError) {
                console.warn(`⚠️ [Upload] Share token generation failed for page ${pageNum} (non-critical)`);
              }
              
              // Convert thumbnail to JSON string
              const thumbnailEncryptedBlob = new Blob([JSON.stringify(thumbnailPackage)], {
                type: 'application/json',
              });
              
              const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  const base64 = result.includes(',') ? result.split(',')[1] : result;
                  resolve(base64);
                };
                reader.onerror = () => reject(new Error('Failed to read thumbnail encrypted file'));
                reader.readAsDataURL(thumbnailEncryptedBlob);
              });
              
              // Upload thumbnail directly (no folder - just collect IDs)
              const thumbnailEncryptedFileName = `thumb_${baseFileName}-page-${pageNum}.png.encrypted`;
              const thumbnailResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${freshAccessToken}`
                },
                body: JSON.stringify({
                  fileData: thumbnailBase64,
                  fileName: thumbnailEncryptedFileName,
                  mimeType: 'application/json',
                  accountId: accountId
                })
              });
              
              if (thumbnailResponse.ok) {
                const thumbnailUploadResult = await thumbnailResponse.json();
                if (thumbnailUploadResult.file?.id) {
                  pdfPageThumbnailIds.push(thumbnailUploadResult.file.id); // Collect thumbnail ID
                  // Store share token for this thumbnail (NO API CALLS!)
                  if (thumbnailShareToken) {
                    pdfPageThumbnailTokens.push(JSON.stringify(thumbnailShareToken));
                  } else {
                    pdfPageThumbnailTokens.push(''); // Placeholder - token generation failed
                    console.warn(`⚠️ [Upload] No share token for page ${pageNum} thumbnail - will require API calls`);
                  }
                  console.log(`✅ [Upload] Page ${pageNum}/${numPages} thumbnail uploaded (ID: ${thumbnailUploadResult.file.id})${thumbnailShareToken ? ' with publicToken' : ''}`);
                } else {
                  console.warn(`⚠️ [Upload] Page ${pageNum} thumbnail upload succeeded but no file ID returned`);
                }
              } else {
                const thumbErrorText = await thumbnailResponse.text().catch(() => 'Unknown error');
                console.warn(`⚠️ [Upload] Failed to upload page ${pageNum} thumbnail: ${thumbnailResponse.status} - ${thumbErrorText}`);
                // Continue with other pages even if one fails
              }
            } catch (pageError: any) {
              console.error(`❌ [Upload] Error converting page ${pageNum}:`, pageError?.message || pageError);
              // Continue with other pages even if one fails
            }
          }
          
          if (pdfPageThumbnailIds.length > 0) {
            console.log(`✅ [Upload] Generated ${pdfPageThumbnailIds.length} PDF page thumbnails`);
          } else {
            console.log(`⚠️ [Upload] No PDF thumbnails were generated`);
          }
        } catch (pdfError: any) {
          console.error('❌ [Upload] PDF conversion failed:', pdfError?.message || pdfError);
          console.log('📄 [Upload] Continuing with regular PDF upload (PNG conversion is optional)');
          // Continue with regular PDF upload as fallback - don't fail the entire upload
          pdfPageThumbnailIds = []; // Clear thumbnail IDs
          pdfPageThumbnailTokens = []; // Clear thumbnail tokens
        }
      }

      // Generate thumbnail for slideshow (from first PDF page) - use first thumbnail ID if available
      let thumbnailFileId: string | undefined = undefined;
      if (isPDF && pdfPageThumbnailIds.length > 0) {
        // Use the first thumbnail ID as the main thumbnail for the feed
        thumbnailFileId = pdfPageThumbnailIds[0];
        console.log(`✅ [Upload] Using first PDF page thumbnail as main thumbnail: ${thumbnailFileId}`);
      } else if (isPDF) {
        // The first thumbnail was already uploaded to the folder, we can use it
        // For now, we'll generate a separate thumbnail for the feed (can optimize later)
        try {
          const pdfjsLib = await import('pdfjs-dist');
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          }
          
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdf = await loadingTask.promise;
          
          // Render first page at thumbnail size (800px max width)
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.0 });
          const scale = Math.min(800 / viewport.width, 800 / viewport.height);
          const thumbnailViewport = page.getViewport({ scale });
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.width = thumbnailViewport.width;
            canvas.height = thumbnailViewport.height;
            
            await page.render({
              canvasContext: context,
              viewport: thumbnailViewport
            }).promise;
            
            // Convert to JPEG blob
            const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to convert canvas to blob'));
              }, 'image/jpeg', 0.8);
            });
            
            // Upload thumbnail
            const freshToken = await PNOAuthService.getValidAccessToken();
            if (freshToken) {
              thumbnailFileId = await uploadThumbnailLocal(
                thumbnailBlob,
                file.name.replace(/\.pdf$/i, ''),
                encryptionManager,
                session,
                publicKey,
                freshToken,
                accountId
              );
            }
          }
        } catch (thumbError: any) {
          // Don't fail upload if thumbnail fails
        }
      }
      
      // Upload the original PDF file (always upload PDF, even if thumbnails were created)
      let fileId: string | undefined = undefined;
      let pdfFileId: string | undefined = undefined;
      let shareToken: any = undefined;
      let freshAccessToken: string | undefined = undefined;
      
      if (isPDF && pdfPageThumbnailIds.length > 0) {
        // PDF thumbnails were created - upload the original PDF file
        console.log('📄 [Upload] PDF thumbnails created, uploading original PDF file...');
        
        // Get access token for PDF upload
        freshAccessToken = await PNOAuthService.getValidAccessToken();
        if (!freshAccessToken) {
          throw new Error('No valid access token available for PDF upload');
        }
        
        // Upload the original PDF file
        const pdfArrayBuffer = await file.arrayBuffer();
        const pdfData = new Uint8Array(pdfArrayBuffer);
        const pdfEncrypted = await encryptionManager.encrypt(
          pdfData,
          session.did,
          publicKey
        );
        
        const pdfPackage: EncryptedFilePackage = {
          encrypted: pdfEncrypted.encrypted,
          iv: pdfEncrypted.iv,
          salt: pdfEncrypted.salt,
          metadata: {
            originalName: file.name,
            originalSize: file.size,
            originalMimeType: 'application/pdf',
          },
        };
        
        // Generate share token for PDF
        try {
          const encryptionService = getEncryptionService();
          shareToken = await encryptionService.generateShareToken(
            pdfPackage,
            {
              id: session.did,
              publicKey: publicKey
            }
          );
        } catch (tokenError) {
          console.warn('⚠️ [Upload] Share token generation failed for PDF (non-critical)');
        }
        
        const pdfEncryptedBlob = new Blob([JSON.stringify(pdfPackage)], {
          type: 'application/json',
        });
        
        const pdfBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('Failed to read PDF encrypted file'));
          reader.readAsDataURL(pdfEncryptedBlob);
        });
        
        const pdfEncryptedFileName = `${file.name}.encrypted`;
        const pdfUploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshAccessToken}`
          },
          body: JSON.stringify({
            fileData: pdfBase64,
            fileName: pdfEncryptedFileName,
            mimeType: 'application/json',
            accountId: accountId
          })
        });
        
        if (pdfUploadResponse.ok) {
          const pdfUploadResult = await pdfUploadResponse.json();
          pdfFileId = pdfUploadResult.file?.id;
          fileId = pdfFileId; // Use PDF file ID as the main file ID
          console.log(`✅ [Upload] Original PDF uploaded (ID: ${pdfFileId})`);
        } else {
          const errorText = await pdfUploadResponse.text().catch(() => 'Unknown error');
          console.error(`❌ [Upload] Failed to upload PDF: ${pdfUploadResponse.status} - ${errorText}`);
          throw new Error(`Failed to upload PDF: ${errorText}`);
        }
      } else {
        // Upload the original file (either not a PDF, or PDF conversion failed)
        // Refresh access token before uploading main file (in case it expired during PNG conversion)
        freshAccessToken = await PNOAuthService.getValidAccessToken();
        if (!freshAccessToken) {
          throw new Error('No valid access token available for upload');
        }

        // Generate thumbnail for images and videos BEFORE encryption
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        
        // Declare thumbnailShareToken outside the block so it's accessible for metadata submission
        let thumbnailShareToken: any = undefined;
        
        if ((isImage || isVideo) && !thumbnailFileId) {
          try {
            let thumbnailBlob: Blob;
            
            if (isImage) {
              // Generate thumbnail from image using the local helper function
              // File extends Blob, so we can pass it directly
              thumbnailBlob = await createThumbnailFromBlobLocal(file, 800, 800);
            } else if (isVideo) {
              // Generate thumbnail from video (extract first frame)
              thumbnailBlob = await createVideoThumbnailLocal(file, 800, 800);
            } else {
              throw new Error('Unsupported file type for thumbnail generation');
            }
            
            // Upload thumbnail using the local helper function
            // CRITICAL: Generate publicToken for thumbnail BEFORE uploading so it can be included in metadata
            if (thumbnailBlob) {
              // Create thumbnail package to generate share token
              const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
              const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
              const thumbnailEncrypted = await encryptionManager.encrypt(
                thumbnailData,
                session.did,
                publicKey
              );
              
              const thumbnailPackage: EncryptedFilePackage = {
                encrypted: thumbnailEncrypted.encrypted,
                iv: thumbnailEncrypted.iv,
                salt: thumbnailEncrypted.salt,
                metadata: {
                  originalName: `thumb_${file.name}`,
                  originalSize: thumbnailBlob.size,
                  originalMimeType: 'image/jpeg',
                },
              };
              
              // Generate share token for thumbnail (required for public feed decryption)
              try {
                const encryptionService = getEncryptionService();
                thumbnailShareToken = await encryptionService.generateShareToken(
                  thumbnailPackage,
                  {
                    id: session.did,
                    publicKey: publicKey
                  }
                );
                console.log('✅ [Upload] Thumbnail share token generated');
              } catch (tokenError) {
                console.warn('⚠️ [Upload] Share token generation failed for thumbnail:', tokenError);
              }
              
              // Now upload the thumbnail
              thumbnailFileId = await uploadThumbnailLocal(
                thumbnailBlob,
                file.name,
                encryptionManager,
                session,
                publicKey,
                freshAccessToken,
                accountId
              );
              
              // CRITICAL: Submit THUMBNAIL FILE to public index (not main file)
              // The thumbnail is what appears in the feed, main file is only for downloads
              // Note: This will be done after main file upload so we have fileId reference
            } else {
              throw new Error('Thumbnail blob not available');
            }
          } catch (thumbError: any) {
            // Don't fail upload if thumbnail fails
          }
        }

      // Encrypt file using the same standard as dashboard
      const fileArrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(fileArrayBuffer);
      
        // encryptionManager already initialized above
      const encrypted = await encryptionManager.encrypt(
        fileData,
        session.did, // Use DID as pnId (matches dashboard)
        publicKey
      );

      // Create encrypted file package (same format as dashboard)
      const packageData: EncryptedFilePackage = {
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
        salt: encrypted.salt,
        metadata: {
          originalName: file.name,
          originalSize: file.size,
          originalMimeType: file.type,
        },
      };

      // Generate share token now (during upload) so it's ready for public sharing
      // This matches the dashboard's behavior and avoids having to regenerate it later
      console.log('🔑 [Upload] Generating share token for future public sharing...');
      try {
        const encryptionService = getEncryptionService();
        shareToken = await encryptionService.generateShareToken(
          packageData,
          {
            id: session.did,
            publicKey: publicKey
          }
        );
        console.log('✅ [Upload] Share token generated successfully');
      } catch (tokenError: any) {
        console.error('❌ [Upload] Share token generation failed:', {
          error: tokenError?.message || tokenError,
        });
        // Don't fail the upload if token generation fails - user can try making it public later
        shareToken = undefined;
      }

      // Convert to JSON string (will be uploaded as .encrypted file)
      const encryptedBlob = new Blob([JSON.stringify(packageData)], {
        type: 'application/json',
      });

      // Convert encrypted blob to base64
      const base64File = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read encrypted file'));
        reader.readAsDataURL(encryptedBlob);
      });

        // Upload encrypted file with .encrypted extension (use fresh token)
      const encryptedFileName = `${file.name}.encrypted`;
      const response = await fetch(`${apiEndpoint}/api/drive/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshAccessToken}`
        },
        body: JSON.stringify({
          fileData: base64File,
          fileName: encryptedFileName,
          mimeType: 'application/json', // Encrypted files are stored as JSON
          accountId: accountId
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Upload failed: ${errorText}`);
      }

      const uploadResult = await response.json();
      const uploadedFile = uploadResult.file;
      
      if (!uploadedFile || !uploadedFile.id) {
        throw new Error('Upload succeeded but no file ID returned');
      }

        fileId = uploadedFile.id;
      console.log('✅ [Upload] File uploaded successfully, fileId:', fileId);
      }

      // Create initial metadata entry (matches dashboard behavior)
      // This ensures the file appears properly in the system and can be edited/shared later
      try {
        console.log('📝 [Upload] Creating initial metadata entry...');
        
        // Determine file type from MIME type
        // For PDF slideshows, set fileType to 'document' so they're treated as media files
        const fileType = (isPDF && pdfPageThumbnailIds.length > 0) ? 'document' // PDF slideshow
          : file.type.startsWith('image/') ? 'image' 
          : file.type.startsWith('video/') ? 'video'
          : file.type.startsWith('audio/') ? 'audio'
          : 'document';

        // Default to public content (isNSFW: false)
        // Users can mark content as NSFW during upload or edit
        
        // Create metadata entry for MAIN FILE (private - not in public index)
        // Main file is only used for downloads, thumbnail is what appears in feed
        console.log(`📝 [Upload] Saving metadata for main file (private)${pdfPageThumbnailIds.length > 0 ? ` with ${pdfPageThumbnailIds.length} PDF page thumbnails` : ''}`);
        const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshAccessToken}` // Use fresh token
          },
          body: JSON.stringify({
            name: file.name,
            description: '',
            keywords: [],
            tags: [],
            fileType: fileType,
            isPublic: false, // Main file is PRIVATE - only thumbnail appears in public index
            publicToken: shareToken ? JSON.stringify(shareToken) : undefined, // Store share token for downloads
            uploadDate: new Date().toISOString(),
            isNSFW: false,
            pdfPageThumbnailIds: pdfPageThumbnailIds.length > 0 ? pdfPageThumbnailIds : undefined, // Store PDF page thumbnail IDs for slideshow
            pdfPageThumbnailTokens: pdfPageThumbnailTokens.length > 0 ? pdfPageThumbnailTokens : undefined, // Store PDF page thumbnail tokens (NO API CALLS!)
            pdfFileId: pdfFileId, // Store original PDF file ID for on-demand rendering
            thumbnailFileId: thumbnailFileId, // Store thumbnail file ID reference
            // Include accountId in query params if needed
          }),
        });

        if (metadataResponse.ok) {
          const metadataResult = await metadataResponse.json();
          console.log('✅ [Upload] Main file metadata entry created (private)');
          
          // CRITICAL: Submit THUMBNAIL FILE to public index (not main file)
          // The thumbnail is what appears in the feed, main file is only for downloads
          if (thumbnailFileId && (isImage || isVideo)) {
            try {
              // Submit thumbnail to public index
              const thumbnailMetadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${thumbnailFileId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${freshAccessToken}`
                },
                body: JSON.stringify({
                  name: `thumb_${file.name}`, // Include thumb_ prefix so public index query can find it
                  title: cleanTitle(file.name), // Clean title for display (no thumb_ prefix, no extension)
                  description: '',
                  keywords: [],
                  tags: [],
                  fileType: 'image', // Thumbnails are always images
                  isPublic: true, // Thumbnail goes in public index
                  uploadDate: new Date().toISOString(),
                  isNSFW: false,
                  // Store reference to main file for downloads
                  mainFileId: fileId, // Reference to the full file for downloads
                  publicToken: thumbnailShareToken ? JSON.stringify(thumbnailShareToken) : undefined, // CRITICAL: Required for feed decryption
                }),
              });
              
              if (thumbnailMetadataResponse.ok) {
                console.log('✅ [Upload] Thumbnail submitted to public index');
              } else {
                const errorText = await thumbnailMetadataResponse.text().catch(() => 'Unknown error');
                console.warn('⚠️ [Upload] Failed to submit thumbnail to public index:', errorText);
              }
            } catch (thumbIndexError) {
              console.error('❌ [Upload] Failed to submit thumbnail to public index:', thumbIndexError);
              // Don't fail upload if thumbnail indexing fails
            }
          }
          
          // Update local metadata map
          if (metadataResult.metadata) {
            setFileMetadataMap(prev => {
              const next = new Map(prev);
              next.set(fileId, metadataResult.metadata);
              return next;
            });
          }
        } else {
          const errorText = await metadataResponse.text().catch(() => 'Unknown error');
          console.warn('⚠️ [Upload] Failed to create metadata entry (non-critical):', errorText);
          // Don't fail the upload - metadata can be created later
        }
      } catch (metadataError: any) {
        console.warn('⚠️ [Upload] Metadata creation failed (non-critical):', metadataError?.message || metadataError);
        // Don't fail the upload - metadata can be created later
      }

      // Reload files for this account
      console.log('🔄 [Upload] Reloading files...');
      await loadFilesForAccount(accountId);
      
      const input = fileInputRefs.current.get(accountId);
      if (input) {
        input.value = ''; // Reset so onChange fires even if same file is selected again
      }
      
      console.log('✅ [Upload] Upload flow completed successfully');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to upload file';
      setError(errorMessage);
      console.error('[FileStorageAggregator] Upload error:', err);
      
      // Reset file input on error too
      const input = fileInputRefs.current.get(accountId);
      if (input) input.value = '';
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Show warning if no accounts */}
      {driveAccounts.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-yellow-400" />
            <span className="text-yellow-400 text-sm">No cloud storage accounts connected. Connect in the dashboard.</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File List - One section per account */}
      {hasConnectedBackends && (
        <div className="space-y-6">
          {driveAccounts.map((account, index) => {
            const accountFiles = filesByAccount.get(account.accountId) || [];

            return (
              <div key={account.accountId} className="bg-neutral-900/60 border border-neutral-700 rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Cloud className="h-5 w-5 text-blue-400 flex-shrink-0" />
                    <span className="text-white font-semibold truncate">
                      {account.email || account.displayName || `Drive ${index + 1}`}
                    </span>
                    <button
                      onClick={() => {
                        // Disconnect - just remove from UI for now (would need API endpoint)
                        setDriveAccounts(prev => prev.filter(a => a.accountId !== account.accountId));
                      }}
                      className="text-red-400 hover:text-red-300 text-sm flex-shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => {
                        loadFilesForAccount(account.accountId);
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
                      title="Refresh Files"
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <input
                      type="file"
                      ref={(el) => {
                        if (el) {
                          fileInputRefs.current.set(account.accountId, el);
                        } else {
                          fileInputRefs.current.delete(account.accountId);
                        }
                      }}
                      className="hidden"
                      disabled={isLoading}
                      onChange={(e) => {
                        handleUploadForAccount(account.accountId, e);
                      }}
                    />
                    <div className="relative">
                      <button
                        ref={(el) => {
                          if (el) {
                            addButtonRefs.current.set(account.accountId, el);
                          } else {
                            addButtonRefs.current.delete(account.accountId);
                          }
                        }}
                        onClick={(e) => {
                          const button = e.currentTarget;
                          const rect = button.getBoundingClientRect();
                          setShowAddMenuFor(account.accountId);
                          setAddMenuPosition({
                            top: rect.bottom,
                            left: rect.left + rect.width / 2
                          });
                        }}
                        disabled={isLoading}
                        className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
                        title="Add Content"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {showAddMenuFor === account.accountId && addMenuPosition && (
                        <div
                          data-add-menu={account.accountId}
                          className="fixed z-50 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg py-1 min-w-[160px]"
                          style={{
                            top: `${addMenuPosition.top}px`,
                            left: `${addMenuPosition.left}px`,
                            transform: 'translateX(-50%)',
                            marginTop: '8px'
                          }}
                        >
                          <button
                            onClick={() => {
                              if (onOpenTextEditor) {
                                onOpenTextEditor(account.accountId);
                              }
                              setShowAddMenuFor(null);
                              setAddMenuPosition(null);
                            }}
                            className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                          >
                            <Type className="h-4 w-4" />
                            Add Thought
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(account.accountId);
                              const input = fileInputRefs.current.get(account.accountId);
                              if (input) {
                                input.click();
                              } else {
                                console.error('[FileStorageAggregator] File input not found for account:', account.accountId);
                                setError('File input not initialized. Please refresh the page.');
                              }
                              setShowAddMenuFor(null);
                              setAddMenuPosition(null);
                            }}
                            className="w-full px-4 py-2 text-left text-white hover:bg-neutral-700 flex items-center gap-2 text-sm"
                          >
                            <Upload className="h-4 w-4" />
                            Add File
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setIsBulkDeleteMode(!isBulkDeleteMode);
                        if (isBulkDeleteMode) {
                          setSelectedFiles(new Set());
                        }
                      }}
                      disabled={isLoading}
                      className="p-2 rounded text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 flex items-center justify-center"
                      title={isBulkDeleteMode ? "Cancel Bulk Delete" : "Bulk Delete"}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded transition-colors flex items-center justify-center ${
                        viewMode === 'list'
                          ? 'bg-blue-600 text-white'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title="List View"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-2 rounded transition-colors flex items-center justify-center ${
                        viewMode === 'grid'
                          ? 'bg-blue-600 text-white'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                      title="Grid View"
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {accountFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <File className="h-12 w-12 text-text-secondary mx-auto mb-4" />
                    <p className="text-text-secondary">No files found for this account</p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {accountFiles.map((file) => {
                const isImage = file.mimeType?.startsWith('image/');
                const isVideo = file.mimeType?.startsWith('video/');
                const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
                const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                
                // Check if this is a PDF slideshow folder (folder ending with "-pages")
                const isPDFSlideshowFolder = file.mimeType === 'application/vnd.google-apps.folder' && 
                                             nameWithoutEncrypted.toLowerCase().endsWith('-pages');
                
                
                // For encrypted files, check if they're media files by extension
                // Also treat PDF slideshow folders as PDF files
                const isPDF = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name) || isPDFSlideshowFolder;
                const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                                 (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') && 
                                          (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                let isMediaFile = isImage || isVideo || isPDF || isThought || isThoughtThumbnail;
                if (isEncrypted) {
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  const hasPDFExt = /\.pdf$/i.test(nameWithoutEncrypted);
                  const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) || 
                                       (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                       nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
                  isMediaFile = hasImageExt || hasVideoExt || hasPDFExt || hasThoughtExt;
                }
                
                // PDF slideshow folders are always media files
                if (isPDFSlideshowFolder) {
                  isMediaFile = true;
                }
                

                return (
                  <div
                    key={file.id}
                    className={`bg-neutral-800/50 rounded-lg overflow-hidden hover:bg-neutral-800 transition-colors group ${
                      isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                    } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={(e) => {
                      // Handle checkbox click in bulk delete mode
                      if (isBulkDeleteMode) {
                        const target = e.target as HTMLElement;
                        if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                          toggleFileSelection(file.id);
                          return;
                        }
                        toggleFileSelection(file.id);
                        return;
                      }
                      // Don't open file viewer if clicking on menu button or menu
                      const target = e.target as HTMLElement;
                      if (target.closest('[data-menu-button]') || target.closest('.menu-container')) {
                        return;
                      }
                      setViewingFile({ ...file, accountId: file.accountId || account.accountId });
                    }}
                  >
                    {/* Checkbox for bulk delete mode */}
                    {isBulkDeleteMode && (
                      <div className="absolute top-2 left-2 z-30" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                          className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    <div className="relative aspect-square bg-neutral-700/50 overflow-hidden">
                      {isMediaFile ? (
                        <ThumbnailImage 
                          fileId={file.id}
                          accountId={file.accountId || account.accountId}
                          fileName={file.name}
                          alt={file.name}
                          mimeType={file.mimeType}
                          mainFileId={(file as any).mainFileId}
                          isThumbnail={(file as any).isThumbnail}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Lock className="h-8 w-8 text-blue-400" />
                        </div>
                      )}
                      {/* Public indicator - moved to top left to make room for menu */}
                      {file.isPublic && (
                        <div className="absolute top-2 left-2 bg-green-500/80 rounded-full p-1 z-10">
                          <Globe className="h-3 w-3 text-white" />
                        </div>
                      )}
                      {/* Menu button - top right corner (hidden in bulk delete mode) */}
                      {!isBulkDeleteMode && (
                        <div className="absolute top-2 right-2 z-20 menu-container" onClick={(e) => e.stopPropagation()}>
                          <button
                          ref={(el) => {
                            if (el) menuButtonRefs.current.set(file.id, el);
                            else menuButtonRefs.current.delete(file.id);
                          }}
                          data-menu-button={file.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const button = e.currentTarget;
                            const rect = button.getBoundingClientRect();
                            const newState = openMenuFor === file.id ? null : file.id;
                            if (newState) {
                              // Position menu below the button for grid view (top right)
                              setMenuPosition({
                                top: rect.bottom + 8, // 8px below button
                                left: rect.right - 176 // 176px = w-44 (11rem), align right edge
                              });
                            } else {
                              setMenuPosition(null);
                            }
                            setOpenMenuFor(newState);
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          className="bg-neutral-900/80 hover:bg-neutral-800/90 rounded-full p-1.5 transition-colors"
                          title="File actions"
                          disabled={isLoading}
                        >
                            <MoreVertical className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      )}
                      {isMediaFile && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <Eye className="h-6 w-6 text-white" />
                        </div>
                      )}
                    </div>

                    <div className="p-3">
                      <p className="text-white text-xs truncate mb-1" title={fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name}>
                        {cleanTitle(fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name)}
                      </p>
                      <p className="text-text-secondary text-xs">
                        {(parseInt(file.size || '0') / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                    );
                  })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accountFiles.map((file) => {
                const isImage = file.mimeType?.startsWith('image/');
                const isVideo = file.mimeType?.startsWith('video/');
                const isEncrypted = file.name.toLowerCase().endsWith('.encrypted');
                
                // For encrypted files, check if they're media files by extension
                const isPDF = file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name);
                const nameWithoutEncrypted = file.name.replace(/\.encrypted$/i, '');
                const isThought = nameWithoutEncrypted.toLowerCase().startsWith('thought-') && 
                                 (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                const isThoughtThumbnail = nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') && 
                                          (nameWithoutEncrypted.toLowerCase().endsWith('.thought') || nameWithoutEncrypted.toLowerCase().endsWith('.png'));
                let isMediaFile = isImage || isVideo || isPDF || isThought || isThoughtThumbnail;
                if (isEncrypted) {
                  const hasImageExt = /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)$/i.test(nameWithoutEncrypted);
                  const hasVideoExt = /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(nameWithoutEncrypted);
                  const hasPDFExt = /\.pdf$/i.test(nameWithoutEncrypted);
                  const hasThoughtExt = /\.thought$/i.test(nameWithoutEncrypted) || 
                                       (nameWithoutEncrypted.toLowerCase().startsWith('thought-') && nameWithoutEncrypted.toLowerCase().endsWith('.png')) ||
                                       nameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
                  isMediaFile = hasImageExt || hasVideoExt || hasPDFExt || hasThoughtExt;
                }

                return (
                  <div
                    key={file.id}
                    className={`flex items-center justify-between p-3 bg-neutral-800/50 rounded-lg hover:bg-neutral-800 transition-colors ${
                      isBulkDeleteMode ? 'cursor-default' : 'cursor-pointer'
                    } ${selectedFiles.has(file.id) ? 'ring-2 ring-blue-500' : ''}`}
                    onClick={(e) => {
                      // Handle checkbox click in bulk delete mode
                      if (isBulkDeleteMode) {
                        const target = e.target as HTMLElement;
                        if (target.closest('input[type="checkbox"]') || target.closest('label')) {
                          toggleFileSelection(file.id);
                          return;
                        }
                        toggleFileSelection(file.id);
                        return;
                      }
                      setViewingFile({ ...file, accountId: file.accountId || account.accountId });
                    }}
                  >
                    {/* Checkbox for bulk delete mode */}
                    {isBulkDeleteMode && (
                      <div className="flex-shrink-0 mr-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file.id)}
                          onChange={() => toggleFileSelection(file.id)}
                          className="w-5 h-5 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      {isMediaFile ? (
                        <div className="w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-neutral-700">
                          <ThumbnailImage 
                            fileId={file.id}
                            accountId={file.accountId || account.accountId}
                            fileName={file.name}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            mainFileId={(file as any).mainFileId}
                            isThumbnail={(file as any).isThumbnail}
                          />
                        </div>
                      ) : (
                        <Lock className="h-4 w-4 text-blue-400 flex-shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-white text-sm truncate">
                            {cleanTitle(fileMetadataMap.get(file.id)?.title || fileMetadataMap.get(file.id)?.name || (file as any).displayName || file.name)}
                          </p>
                          {file.isPublic && (
                            <Globe className="h-3 w-3 text-green-400 flex-shrink-0" aria-label="Public" />
                          )}
                        </div>
                        <p className="text-text-secondary text-xs">
                          {account.accountId || 'google_drive'} • {(parseInt(file.size || '0') / 1024).toFixed(2)} KB
                        </p>
                      </div>
                    </div>
                    {!isBulkDeleteMode && (
                      <div className="flex items-center justify-center space-x-2" onClick={(e) => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            ref={(el) => {
                              if (el) menuButtonRefs.current.set(file.id, el);
                              else menuButtonRefs.current.delete(file.id);
                            }}
                            data-menu-button={file.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              const newState = openMenuFor === file.id ? null : file.id;
                              if (newState) {
                                // Position menu to the left of the button, with top aligned to button top
                                setMenuPosition({
                                  top: rect.top, // Align top of menu with top of button
                                  left: rect.left - 180 // 180px = w-44 (176px) + 4px spacing
                                });
                              } else {
                                setMenuPosition(null);
                              }
                              setOpenMenuFor(newState);
                            }}
                            style={{
                              width: '28px',
                              height: '28px',
                              padding: 0,
                              margin: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(64, 64, 64, 0.5)',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              color: '#a3a3a3',
                              lineHeight: 0
                            }}
                            className="transition-colors disabled:opacity-50 hover:bg-neutral-700"
                            title="File actions"
                            disabled={isLoading}
                          >
                            <MoreVertical className="h-4 w-4" style={{ margin: 0, padding: 0 }} />
                          </button>
                          {/* Menu will be rendered in portal */}
                        </div>
                      </div>
                    )}
                  </div>
                    );
                  })}
                  </div>
                )}
                
                {/* Bulk Delete Button */}
                {isBulkDeleteMode && (() => {
                  const accountSelectedFiles = accountFiles.filter(f => selectedFiles.has(f.id));
                  const selectedCount = accountSelectedFiles.length;
                  
                  return (
                    <div className="mt-4 pt-4 border-t border-neutral-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (selectedCount === accountFiles.length) {
                              // Deselect all files from this account
                              setSelectedFiles(prev => {
                                const newSet = new Set(prev);
                                accountFiles.forEach(f => newSet.delete(f.id));
                                return newSet;
                              });
                            } else {
                              selectAllFiles(account.accountId);
                            }
                          }}
                          className="px-3 py-1.5 text-sm text-white hover:bg-neutral-700 rounded transition-colors"
                        >
                          {selectedCount === accountFiles.length ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-text-secondary text-sm">
                          {selectedCount} file{selectedCount !== 1 ? 's' : ''} selected
                        </span>
                      </div>
                      <button
                        onClick={() => handleBulkDelete(account.accountId)}
                        disabled={selectedCount === 0 || isLoading}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Selected ({selectedCount})
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingFile(null)}
        >
          <div 
            className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setViewingFile(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-neutral-800/80 rounded-lg text-white hover:bg-neutral-700 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            
            {viewingFile.accountId ? (
              <FileViewer 
                file={viewingFile}
                accountId={viewingFile.accountId}
                onDownload={() => handleDownload(viewingFile, viewingFile.accountId)}
              />
            ) : (
              <div className="text-center text-white">
                <p>Preview not available</p>
                <button
                  onClick={() => viewingFile.accountId && handleDownload(viewingFile, viewingFile.accountId)}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Download File
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editingFile && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditingFile(null);
            setEditForm({ 
              name: '', 
              description: '', 
              tags: '',
              genre: '',
              category: '',
              locationName: '',
              locationAddress: '',
              license: '',
              isNSFW: false,
              isPublic: false
            });
          }}
        >
          <div 
            className="bg-neutral-800 rounded-lg p-6 max-w-md w-full text-text-primary border border-neutral-700 shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h3 className="text-lg font-semibold">Edit Metadata</h3>
              <button
                onClick={() => {
                    setEditingFile(null);
                    setEditForm({ 
                      name: '', 
                      description: '', 
                      tags: '',
                      genre: '',
                      category: '',
                      locationName: '',
                      locationAddress: '',
                      locationLat: '',
                      locationLng: '',
                      license: '',
                      language: '',
                      isNSFW: false
                    });
                }}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4 overflow-y-auto pr-2 -mr-2 flex-1">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Name / Title
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="File name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="File description"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.tags}
                  onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="tag1, tag2, tag3"
                />
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Content Classification</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Category <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value as FeedCategory | '' })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select a category</option>
                      {FEED_CATEGORY_LIST
                        .map(category => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-text-secondary mt-1">Required: Select the niche category for this content</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Genre (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={editForm.genre}
                      onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="photography, art, documentation"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Location</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Place Name
                    </label>
                    <input
                      type="text"
                      value={editForm.locationName}
                      onChange={(e) => setEditForm({ ...editForm, locationName: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Central Park, New York"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      Address (City, State, Country)
                    </label>
                    <input
                      type="text"
                      value={editForm.locationAddress}
                      onChange={(e) => setEditForm({ ...editForm, locationAddress: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="New York, NY, USA"
                    />
                  </div>

                </div>
              </div>

              <div className="border-t border-neutral-700 pt-4 mt-4">
                <h4 className="text-sm font-semibold text-text-primary mb-3">Rights & Licensing</h4>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">
                      License
                    </label>
                    <select
                      value={editForm.license}
                      onChange={(e) => setEditForm({ ...editForm, license: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a license</option>
                      {LICENSE_TYPES.map(license => (
                        <option key={license.value} value={license.value}>
                          {license.label} - {license.description}
                        </option>
                      ))}
                    </select>
                    {editForm.license && (
                      <p className="text-xs text-text-secondary mt-1">
                        {LICENSE_TYPES.find(l => l.value === editForm.license)?.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 flex-shrink-0 border-t border-neutral-700 mt-4">
                <button
                  onClick={() => {
      setEditingFile(null);
      setEditForm({
        name: '',
        description: '',
        tags: '',
        genre: '',
        category: '',
        locationName: '',
        locationAddress: '',
        license: 'all-rights-reserved'
      });
                  }}
                  className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMetadata}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Settings Modal */}
      {sharingFile && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4"
          onClick={closeShareSettings}
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
                onClick={closeShareSettings}
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
                                onClick={() => handleIndexerToggle(indexer.id)}
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
                onClick={closeShareSettings}
                className="px-4 py-2 text-sm font-semibold uppercase tracking-wide text-text-secondary hover:text-text-primary transition-colors"
                disabled={isSavingShare}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveShareSettings}
                disabled={isSavingShare || (shareVisibility === 'public' && isLoadingIndexers)}
                className="px-5 py-2 text-sm font-semibold uppercase tracking-wide rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingShare ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal-based menu for both grid and list views */}
      {openMenuFor && menuPosition && (() => {
        // Find the file and account for the open menu
        let menuFile: DriveFile | null = null;
        let menuAccountId: string | null = null;
        
        for (const [accountId, files] of filesByAccount.entries()) {
          const file = files.find(f => f.id === openMenuFor);
          if (file) {
            menuFile = file;
            menuAccountId = accountId;
            break;
          }
        }

        if (!menuFile || !menuAccountId) return null;

        const menuContent = (
          <div
            ref={actionMenuRef}
            className="fixed w-44 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-[100] py-1 menu-container"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleEditMetadata(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Edit className="h-4 w-4" />
              <span>Edit metadata</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleDownload(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Download className="h-4 w-4" />
              <span>Download</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleShareSettings(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Share2 className="h-4 w-4" />
              <span>Share settings</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleSetTopPost(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-text-secondary hover:text-yellow-400 hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <Star className={`h-4 w-4 ${fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'fill-yellow-400 text-yellow-400' : ''}`} />
              <span>{fileMetadataMap.get(menuFile!.id)?.isTopPost ? 'Unset top post' : 'Set as top post'}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuFor(null);
                setMenuPosition(null);
                handleDelete(menuFile!, menuAccountId!);
              }}
              className="flex w-full items-center space-x-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-neutral-800 transition-colors"
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
              <span>Delete</span>
            </button>
          </div>
        );

        return createPortal(menuContent, document.body);
      })()}
    </div>
  );
};
