/**
 * Image Slideshow Component
 * Displays image files from a folder as a horizontal scrolling slideshow with snap-to-page navigation
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';

interface ImageSlideshowProps {
  fileId: string; // Folder ID containing image pages
  fileName?: string;
  accountId?: string; // Account ID for downloading images
}

export function ImageSlideshow({ fileId, fileName, accountId }: ImageSlideshowProps) {
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // State for folder-based image pages
  const [folderPageFiles, setFolderPageFiles] = useState<Array<{ id: string; name: string; pageNum: number }>>([]);
  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());

  // Load image pages from folder
  useEffect(() => {
    console.log(`[ImageSlideshow] Loading images from folder:`, { 
      folderId: fileId,
      accountId
    });
    
    const loadFolderPages = async () => {
      try {
        setLoading(true);
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        // Try to get accountId from storage accounts if not provided
        let finalAccountId = accountId;
        if (!finalAccountId || !finalAccountId.includes('::')) {
          try {
            const session = PNOAuthService.loadSession();
            if (session?.did || session?.pnIdentifier) {
              const userId = session.pnIdentifier || session.did;
              const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              
              if (accountsResponse.ok) {
                const accountsData = await accountsResponse.json();
                const accounts = accountsData.accounts || [];
                if (accounts.length > 0) {
                  finalAccountId = accounts[0].accountId;
                  console.log(`[ImageSlideshow] Fetched accountId from storage accounts: ${finalAccountId}`);
                }
              }
            }
          } catch (err) {
            console.warn(`[ImageSlideshow] Failed to fetch accountId, continuing without it:`, err);
          }
        }

        // Query files in folder using Google Drive API query
        const folderQuery = `'${fileId}' in parents and trashed=false`;
        let filesUrl = `${apiEndpoint}/api/drive/files?q=${encodeURIComponent(folderQuery)}&pageSize=1000`;
        
        // Add accountId if we have a valid one
        if (finalAccountId && finalAccountId.includes('::')) {
          filesUrl += `&accountId=${encodeURIComponent(finalAccountId)}`;
        }
        
        console.log(`[ImageSlideshow] Fetching files from folder:`, filesUrl);
        
        let response = await fetch(filesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        // If we get 401, refresh token and retry once
        if (response.status === 401) {
          console.log(`[ImageSlideshow] Got 401, refreshing token and retrying...`);
          const refreshedToken = await PNOAuthService.getValidAccessToken(true); // Force refresh
          if (refreshedToken) {
            response = await fetch(filesUrl, {
              headers: {
                'Authorization': `Bearer ${refreshedToken}`
              }
            });
          }
        }
        
        if (!response.ok) {
          throw new Error(`Failed to list folder files: ${response.status}`);
        }
        
        const data = await response.json();
        const files = data.files || [];
        
        // Extract page numbers from filenames (format: "{name}-page-{num}.png.encrypted")
        const pageFiles = files
          .map((file: any) => {
            const match = file.name.match(/-page-(\d+)\.png\.encrypted$/i);
            if (match) {
              return {
                id: file.id,
                name: file.name,
                pageNum: parseInt(match[1], 10)
              };
            }
            return null;
          })
          .filter((f: any) => f !== null)
          .sort((a: any, b: any) => a.pageNum - b.pageNum); // Sort by page number
        
        console.log(`✅ [ImageSlideshow] Found ${pageFiles.length} image pages in folder`);
        
        if (pageFiles.length > 0) {
          setFolderPageFiles(pageFiles);
          setPages(Array.from({ length: pageFiles.length }, (_, i) => i + 1));
          setCurrentPage(1);
          setLoading(false);
        } else {
          throw new Error('No image pages found in folder');
        }
      } catch (err: any) {
        console.error(`❌ [ImageSlideshow] Failed to load folder pages:`, err);
        setError(err.message || 'Failed to load images');
        setLoading(false);
      }
    };

    loadFolderPages();
  }, [fileId, accountId]);

  // Load individual image pages
  useEffect(() => {
    if (folderPageFiles.length === 0) {
      return;
    }

    console.log(`[ImageSlideshow] Starting to load ${folderPageFiles.length} images from folder...`);

    // Fetch accountId once at the start (not per page)
    const fetchAccountIdOnce = async (): Promise<string | null> => {
      if (accountId && accountId.includes('::')) {
        return accountId;
      }
      
      try {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) return null;
        
        const session = PNOAuthService.loadSession();
        if (session?.did || session?.pnIdentifier) {
          const userId = session.pnIdentifier || session.did;
          const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (accountsResponse.ok) {
            const accountsData = await accountsResponse.json();
            const accounts = accountsData.accounts || [];
            if (accounts.length > 0) {
              return accounts[0].accountId;
            }
          }
        }
      } catch (err) {
        // Silently fail
      }
      return null;
    };

    const loadImagePage = async (pageFile: { id: string; name: string; pageNum: number }, finalAccountId: string | null) => {
      const pageNum = pageFile.pageNum;
      
      // Skip if already loaded or currently loading
      if (loadedPagesRef.current.has(pageNum) || loadingPages.has(pageNum)) {
        console.log(`[ImageSlideshow] Skipping page ${pageNum} (already loaded/loading)`);
        return;
      }
      
      console.log(`[ImageSlideshow] Loading image page ${pageNum}/${folderPageFiles.length}...`);
      setLoadingPages(prev => new Set(prev).add(pageNum));

      try {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        // Use thumbnail endpoint - for encrypted files, API will return the full encrypted file
        // which we'll decrypt client-side
        let thumbnailUrl = `${apiEndpoint}/api/drive/files/${pageFile.id}?thumbnail=true`;
        // Add accountId if we have a valid one
        if (finalAccountId && finalAccountId.includes('::')) {
          thumbnailUrl += `&accountId=${encodeURIComponent(finalAccountId)}`;
        }
        
        console.log(`[ImageSlideshow] Fetching thumbnail for page ${pageNum} from:`, thumbnailUrl);
        const startTime = Date.now();
        
        let response = await fetch(thumbnailUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        // If we get 401, refresh token and retry once
        if (response.status === 401) {
          console.log(`[ImageSlideshow] Got 401 for page ${pageNum}, refreshing token and retrying...`);
          const refreshedToken = await PNOAuthService.getValidAccessToken(true); // Force refresh
          if (refreshedToken) {
            response = await fetch(thumbnailUrl, {
              headers: {
                'Authorization': `Bearer ${refreshedToken}`
              }
            });
          }
        }
        
        if (!response.ok) {
          throw new Error(`Failed to load page ${pageNum} thumbnail: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();
        
        // Check if this is an encrypted file (JSON) or a direct image
        let imageUrl: string;
        
        if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
          // This is an encrypted file - decrypt it
          console.log(`[ImageSlideshow] Page ${pageNum} is encrypted, decrypting...`);
          
          const { EncryptionManager } = await import('../utils/encryptionManager');
          
          // Define EncryptedFilePackage inline (same as FileStorageAggregator)
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
          
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            throw new Error('No session for decryption');
          }
          
          const pnId = session.did;
          let publicKey = session?.publicKey;
          
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8);
          }
          
          if (!publicKey) {
            throw new Error('No public key for decryption');
          }
          
          // Parse encrypted package
          const encryptedText = await blob.text();
          const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedText);
          
          // Decrypt
          const encryptionManager = new EncryptionManager();
          const decryptedData = await encryptionManager.decrypt(
            encryptedPackage.encrypted,
            encryptedPackage.iv,
            encryptedPackage.salt,
            pnId,
            publicKey
          );
          
          // Create image blob from decrypted data
          const decryptedBlob = new Blob([decryptedData], {
            type: encryptedPackage.metadata.originalMimeType || 'image/png'
          });
          
          imageUrl = URL.createObjectURL(decryptedBlob);
          console.log(`✅ [ImageSlideshow] Decrypted PNG page ${pageNum}`);
        } else {
          // Direct image (non-encrypted or already decrypted by API)
          imageUrl = URL.createObjectURL(blob);
        }
        
        const loadTime = Date.now() - startTime;
        console.log(`✅ [ImageSlideshow] Loaded image page ${pageNum} in ${loadTime}ms`);
        
        loadedPagesRef.current.add(pageNum);
        setPageUrls(prev => {
          const next = new Map(prev);
          next.set(pageNum, imageUrl);
          return next;
        });
      } catch (err) {
        console.error(`❌ [ImageSlideshow] Failed to load image page ${pageNum}:`, err);
      } finally {
        setLoadingPages(prev => {
          const next = new Set(prev);
          next.delete(pageNum);
          return next;
        });
      }
    };

    // Load pages progressively: first page immediately, others in background
    (async () => {
      const finalAccountId = await fetchAccountIdOnce();
      
      // Load first page immediately for instant display
      if (folderPageFiles.length > 0) {
        loadImagePage(folderPageFiles[0], finalAccountId);
      }
      
      // Load other pages progressively (with small delay between each)
      // This prevents overwhelming the network/decryption with all pages at once
      for (let i = 1; i < folderPageFiles.length; i++) {
        // Load next page after a short delay (staggered loading)
        setTimeout(() => {
          loadImagePage(folderPageFiles[i], finalAccountId);
        }, i * 200); // 200ms delay between each page
      }
    })();
  }, [folderPageFiles, accountId]);

  // Horizontal swipe navigation
  const swipeRef = useHorizontalSwipe({
    onSwipeLeft: () => {
      if (currentPage < pages.length) {
        setCurrentPage(prev => Math.min(prev + 1, pages.length));
      }
    },
    onSwipeRight: () => {
      if (currentPage > 1) {
        setCurrentPage(prev => Math.max(prev - 1, 1));
      }
    },
    threshold: 50,
    snapThreshold: 0.2
  });

  // Scroll to current page
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    
    const pageElement = pageRefs.current.get(currentPage);
    if (pageElement) {
      pageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentPage]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      pageUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
    };
  }, [pageUrls]);

  if (loading || pages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading slideshow...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-red-400">Error loading slideshow</p>
          <p className="text-sm text-gray-400 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative bg-black">
      {/* Navigation arrows */}
      {currentPage > 1 && (
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {currentPage < pages.length && (
        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, pages.length))}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-black/50 hover:bg-black/70 rounded-full p-2 text-white transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Page indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
        {currentPage} / {pages.length}
      </div>

      {/* Horizontal scrolling container */}
      <div
        ref={(el) => {
          scrollContainerRef.current = el;
          if (swipeRef.current && el) {
            (swipeRef as any).current = el;
          }
        }}
        className="w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{
          scrollBehavior: 'smooth',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="flex h-full">
          {pages.map((pageNum) => {
            const pageImageUrl = pageUrls.get(pageNum);
            const isLoading = loadingPages.has(pageNum);
            
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
                className="w-full h-full flex-shrink-0 snap-center flex items-center justify-center bg-black"
              >
                {isLoading ? (
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm">Loading page {pageNum}...</p>
                  </div>
                ) : pageImageUrl ? (
                  <img
                    src={pageImageUrl}
                    alt={`Page ${pageNum} of ${fileName || 'slideshow'}`}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      imageRendering: 'smooth',
                      transform: 'translateZ(0)',
                      backfaceVisibility: 'hidden'
                    }}
                  />
                ) : (
                  <div className="text-white text-center">
                    <p className="text-sm">Page {pageNum} queued...</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

