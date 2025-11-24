/**
 * Image Slideshow Component
 * Displays image thumbnails as a horizontal scrolling slideshow with snap-to-page navigation
 * Loads thumbnails directly by ID (no folder listing needed!)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';

interface ImageSlideshowProps {
  thumbnailIds: string[]; // Array of thumbnail file IDs (loaded directly, no folder listing)
  fileName?: string;
  accountId?: string; // Account ID for downloading images
  pdfFileId?: string; // PDF file ID for on-demand rendering (if PDF slideshow)
}

export function ImageSlideshow({ thumbnailIds, fileName, accountId, pdfFileId }: ImageSlideshowProps) {
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  const [pageIsThumbnail, setPageIsThumbnail] = useState<Map<number, boolean>>(new Map());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const fullSizeLoadedRef = useRef<Set<number>>(new Set());

  // Initialize pages from thumbnail IDs (no folder listing needed!)
  useEffect(() => {
    if (thumbnailIds.length === 0) {
      setError('No thumbnail IDs provided');
      setLoading(false);
      return;
    }

    console.log(`[ImageSlideshow] Initializing ${thumbnailIds.length} pages from thumbnail IDs`);
    setPages(Array.from({ length: thumbnailIds.length }, (_, i) => i + 1));
    setCurrentPage(1);
    setLoading(false); // Show UI immediately - pages will load progressively
  }, [thumbnailIds]);

  // Fetch accountId helper (non-blocking - can return null)
  const fetchAccountIdOnce = useCallback(async (): Promise<string | null> => {
    if (accountId && accountId.includes('::')) {
      return accountId;
    }
    
    const cachedAccountId = sessionStorage.getItem('slideshow_accountId');
    if (cachedAccountId && cachedAccountId.includes('::')) {
      return cachedAccountId;
    }

    // Don't block - return null if fetch fails, loadThumbnail will handle it
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
            const accountId = accounts[0].accountId;
            sessionStorage.setItem('slideshow_accountId', accountId);
            return accountId;
          }
        }
      }
    } catch (err) {
      // Silently fail - return null, loadThumbnail will try without accountId
    }
    return null;
  }, [accountId]);

  // Load individual thumbnail by ID
  const loadThumbnail = useCallback(async (
    thumbnailId: string,
    pageNum: number,
    finalAccountId: string | null,
    loadFullSize: boolean = false
  ) => {
    if (loadFullSize && fullSizeLoadedRef.current.has(pageNum)) {
      return;
    }
    if (loadingPagesRef.current.has(pageNum)) {
      return;
    }
    
    // Fetch accountId on-demand if not provided (like vertical feed does)
    let accountIdToUse = finalAccountId;
    if (!accountIdToUse) {
      accountIdToUse = await fetchAccountIdOnce();
    }
    
    loadingPagesRef.current.add(pageNum);

    try {
      // If requesting full-size and PDF is available, render from PDF
      if (loadFullSize && pdfFileId) {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        let pdfUrl = `${apiEndpoint}/api/drive/files/${pdfFileId}`;
        if (accountIdToUse && accountIdToUse.includes('::')) {
          pdfUrl += `?accountId=${encodeURIComponent(accountIdToUse)}`;
        } else {
          pdfUrl += '?';
        }
        
        let response = await fetch(pdfUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.status === 401) {
          const refreshedToken = await PNOAuthService.getValidAccessToken(true);
          if (refreshedToken) {
            response = await fetch(pdfUrl, {
              headers: { 'Authorization': `Bearer ${refreshedToken}` }
            });
          }
        }
        
        if (!response.ok) {
          throw new Error(`Failed to load PDF: ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type') || '';
        const blob = await response.blob();
        
        let pdfBlob: Blob;
        if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
          const { EncryptionManager } = await import('../utils/encryptionManager');
          const session = PNOAuthService.loadSession();
          if (!session?.did) throw new Error('No session');
          
          const pnId = session.did;
          let publicKey = session?.publicKey;
          if (!publicKey && session.did.startsWith('did:key:')) {
            publicKey = session.did.substring(8);
          }
          if (!publicKey) throw new Error('No public key');
          
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
          pdfBlob = new Blob([decryptedData], { type: 'application/pdf' });
        } else {
          pdfBlob = blob;
        }
        
        // Render PDF page
        const pdfjsLib = await import('pdfjs-dist');
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Failed to get canvas context');
        
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({ canvasContext: context, viewport }).promise;
        
        const imageBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to convert')), 'image/png', 1.0);
        });
        
        const imageUrl = URL.createObjectURL(imageBlob);
        fullSizeLoadedRef.current.add(pageNum);
        setPageUrls(prev => new Map(prev).set(pageNum, imageUrl));
        setPageIsThumbnail(prev => new Map(prev).set(pageNum, false));
        return;
      }
      
      // Load thumbnail directly by ID
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const { PNOAuthService } = await import('../services/pnOAuthService');
      
      // Try with accountId first, then without if it fails (for public content)
      let fetchUrl = `${apiEndpoint}/api/drive/files/${thumbnailId}?thumbnail=true`;
      if (accountIdToUse && accountIdToUse.includes('::')) {
        fetchUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
      }
      
      // Get access token and retry with refresh if needed
      let accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        console.warn(`[ImageSlideshow] No access token for thumbnail ${thumbnailId}`);
        throw new Error('No access token');
      }
      
      let response: Response;
      try {
        response = await fetch(fetchUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
      } catch (fetchError: any) {
        console.error(`[ImageSlideshow] Fetch error for thumbnail ${thumbnailId}:`, fetchError);
        throw new Error(`Network error loading thumbnail: ${fetchError.message}`);
      }
      
      // If 401, refresh token and retry once
      if (response.status === 401) {
        console.log(`[ImageSlideshow] Got 401 for thumbnail ${thumbnailId}, refreshing token...`);
        const refreshedToken = await PNOAuthService.getValidAccessToken(true); // Force refresh
        if (refreshedToken) {
          try {
            // Retry with refreshed token
            response = await fetch(fetchUrl, {
              headers: { 'Authorization': `Bearer ${refreshedToken}` }
            });
            
            // If still 401 and we had accountId, try without accountId (might be public content)
            if (response.status === 401 && accountIdToUse && accountIdToUse.includes('::')) {
              console.log(`[ImageSlideshow] Still 401 with accountId, trying without accountId for thumbnail ${thumbnailId}...`);
              const urlWithoutAccountId = `${apiEndpoint}/api/drive/files/${thumbnailId}?thumbnail=true`;
              response = await fetch(urlWithoutAccountId, {
                headers: { 'Authorization': `Bearer ${refreshedToken}` }
              });
            }
            
            if (!response.ok) {
              console.warn(`[ImageSlideshow] Thumbnail ${thumbnailId} still failed after refresh: ${response.status}`);
              // Don't throw - just skip this thumbnail (might not exist)
              return;
            }
          } catch (retryError: any) {
            console.error(`[ImageSlideshow] Retry fetch error for thumbnail ${thumbnailId}:`, retryError);
            // Don't throw - just skip this thumbnail
            return;
          }
        } else {
          console.warn(`[ImageSlideshow] Failed to refresh token for thumbnail ${thumbnailId}`);
          return; // Don't throw - just skip this thumbnail
        }
      } else if (!response.ok) {
        console.warn(`[ImageSlideshow] Thumbnail ${thumbnailId} failed: ${response.status}`);
        // Don't throw for non-401 errors either - might be 404 (file doesn't exist)
        return;
      }
      
      const contentType = response.headers.get('content-type') || '';
      const blob = await response.blob();
      
      let imageUrl: string;
      if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
        const { EncryptionManager } = await import('../utils/encryptionManager');
        const session = PNOAuthService.loadSession();
        if (!session?.did) throw new Error('No session');
        
        const pnId = session.did;
        let publicKey = session?.publicKey;
        if (!publicKey && session.did.startsWith('did:key:')) {
          publicKey = session.did.substring(8);
        }
        if (!publicKey) throw new Error('No public key');
        
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
        imageUrl = URL.createObjectURL(decryptedBlob);
      } else {
        imageUrl = URL.createObjectURL(blob);
      }
      
      loadedPagesRef.current.add(pageNum);
      setPageUrls(prev => new Map(prev).set(pageNum, imageUrl));
      setPageIsThumbnail(prev => new Map(prev).set(pageNum, true));
      
      // Preload PDF rendering in background if available
      if (pdfFileId && !fullSizeLoadedRef.current.has(pageNum)) {
        loadThumbnail(thumbnailId, pageNum, accountIdToUse, true).catch(() => {});
      }
    } catch (err) {
      console.error(`❌ [ImageSlideshow] Failed to load page ${pageNum}:`, err);
    } finally {
      loadingPagesRef.current.delete(pageNum);
    }
  }, [pdfFileId, fetchAccountIdOnce]);

  // Load thumbnails sequentially (like the feed) - one at a time with delays
  useEffect(() => {
    if (thumbnailIds.length === 0) return;
    
    let cancelled = false;
    
    // Load all thumbnails sequentially with delays to prevent token refresh conflicts
    (async () => {
      // Fetch accountId once (non-blocking - start loading first page immediately)
      const accountIdPromise = fetchAccountIdOnce();
      
      // Load ALL thumbnails sequentially (including first) with delays
      // Small delay for first page (50ms) so UI appears immediately, then longer delays
      for (let i = 0; i < thumbnailIds.length; i++) {
        if (cancelled) break;
        
        // Small delay for first page, longer for subsequent pages
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Delay between loads
        } else {
          await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for first page
        }
        
        // Use accountId if available, otherwise fetch on-demand
        const accountIdToUse = i === 0 ? null : await accountIdPromise;
        loadThumbnail(thumbnailIds[i], i + 1, accountIdToUse, false).catch(() => {});
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [thumbnailIds, fetchAccountIdOnce, loadThumbnail]);

  // Load pages on-demand when navigating
  useEffect(() => {
    if (thumbnailIds.length === 0) return;
    
    const pagesToLoad = [
      currentPage,
      currentPage + 1,
      currentPage - 1
    ].filter(p => p >= 1 && p <= thumbnailIds.length);
    
    (async () => {
      const finalAccountId = await fetchAccountIdOnce();
      
      for (const pageNum of pagesToLoad) {
        const thumbnailId = thumbnailIds[pageNum - 1];
        if (thumbnailId && !loadedPagesRef.current.has(pageNum) && !loadingPagesRef.current.has(pageNum)) {
          const isCurrentPage = pageNum === currentPage;
          const currentlyThumbnail = pageIsThumbnail.get(pageNum);
          const shouldLoadFullSize = isCurrentPage && currentlyThumbnail && pdfFileId;
          loadThumbnail(thumbnailId, pageNum, finalAccountId, shouldLoadFullSize).catch(() => {});
        }
      }
    })();
  }, [currentPage, thumbnailIds, fetchAccountIdOnce, loadThumbnail, pdfFileId, pageIsThumbnail]);

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
      pageUrls.forEach(url => URL.revokeObjectURL(url));
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
    <div 
      className="w-full h-full flex flex-col bg-black relative"
    >
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-full">
        <span className="text-white text-sm">
          Page {currentPage} of {pages.length}
        </span>
      </div>

      {currentPage > 1 && (
        <button
          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {currentPage < pages.length && (
        <button
          onClick={() => setCurrentPage(prev => Math.min(prev + 1, pages.length))}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div
        ref={(el) => {
          scrollContainerRef.current = el;
          // Attach swipeRef to the scroll container for touch event handling
          (swipeRef as any).current = el;
        }}
        className="flex-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth'
        }}
      >
        <div className="flex h-full">
          {pages.map((pageNum) => {
            const pageImageUrl = pageUrls.get(pageNum);
            const isLoading = loadingPagesRef.current.has(pageNum);
            
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
                className="snap-start flex-shrink-0 w-full h-full flex items-center justify-center"
                style={{
                  minWidth: '100%',
                  maxWidth: '100%'
                }}
              >
                {pageImageUrl ? (
                  <img
                    src={pageImageUrl}
                    alt={`Page ${pageNum}${fileName ? ` of ${fileName}` : ''}`}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))'
                    }}
                  />
                ) : isLoading ? (
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm">Loading page {pageNum}...</p>
                  </div>
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
