/**
 * Image Slideshow Component
 * Displays image thumbnails as a horizontal scrolling slideshow with snap-to-page navigation
 * Loads thumbnails directly by ID (no folder listing needed!)
 * 
 * Architecture: Show slideshow structure immediately, load thumbnails in parallel (non-blocking)
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
  // Initialize pages synchronously from thumbnailIds - INSTANT display, no loading screen!
  const initialPages = thumbnailIds.length > 0 
    ? Array.from({ length: thumbnailIds.length }, (_, i) => i + 1)
    : [];
  
  const [pages, setPages] = useState<number[]>(initialPages);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  const [pageIsThumbnail, setPageIsThumbnail] = useState<Map<number, boolean>>(new Map());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const fullSizeLoadedRef = useRef<Set<number>>(new Set());
  const failedPagesRef = useRef<Set<number>>(new Set()); // Track failed pages

  // Update pages when thumbnailIds change (but don't block initial render)
  useEffect(() => {
    if (thumbnailIds.length === 0) {
      setError('No thumbnail IDs provided');
      setPages([]);
      return;
    }

    console.log(`[ImageSlideshow] Initializing ${thumbnailIds.length} pages from thumbnail IDs`);
    setPages(Array.from({ length: thumbnailIds.length }, (_, i) => i + 1));
    setCurrentPage(1);
    // Reset state when thumbnailIds change
    setPageUrls(new Map());
    loadedPagesRef.current.clear();
    loadingPagesRef.current.clear();
    failedPagesRef.current.clear();
  }, [thumbnailIds]);

  // Fetch accountId helper (non-blocking, returns null if unavailable)
  const fetchAccountIdOnce = useCallback(async (): Promise<string | null> => {
    if (accountId && accountId.includes('::')) {
      return accountId;
    }
    
    const cachedAccountId = sessionStorage.getItem('slideshow_accountId');
    if (cachedAccountId && cachedAccountId.includes('::')) {
      return cachedAccountId;
    }

    // Don't block - return null if fetch fails
    try {
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const { PNOAuthService } = await import('../services/pnOAuthService');
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return null;
      
      const session = PNOAuthService.loadSession();
      if (session?.did || session?.pnIdentifier) {
        const userId = session.pnIdentifier || session.did;
        const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
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
      // Silently fail - return null
    }
    return null;
  }, [accountId]);

  // Load individual thumbnail by ID - EXACT COPY of FullScreenFeed pattern
  const loadThumbnail = useCallback(async (
    thumbnailId: string,
    pageNum: number,
    accountIdHint: string | null, // Hint, but we'll fetch it properly like FullScreenFeed
    loadFullSize: boolean = false
  ) => {
    // Skip if already loaded or loading
    if (loadFullSize && fullSizeLoadedRef.current.has(pageNum)) {
      return;
    }
    if (loadingPagesRef.current.has(pageNum)) {
      return;
    }
    if (failedPagesRef.current.has(pageNum) && !loadFullSize) {
      return; // Don't retry failed thumbnails unless loading full size
    }
    
    loadingPagesRef.current.add(pageNum);
    
    try {
      // If requesting full-size and PDF is available, render from PDF
      if (loadFullSize && pdfFileId) {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token for PDF rendering');
        }

        // Get accountId like FullScreenFeed does
        let accountIdToUse = accountIdHint || accountId;
        if (!accountIdToUse || !accountIdToUse.includes('::')) {
          try {
            const session = PNOAuthService.loadSession();
            if (session?.did || session?.pnIdentifier) {
              const userId = session.pnIdentifier || session.did;
              const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              if (accountsResponse.ok) {
                const accountsData = await accountsResponse.json();
                const accounts = accountsData.accounts || [];
                if (accounts.length > 0) {
                  accountIdToUse = accounts[0].accountId;
                }
              }
            }
          } catch (err) {
            // Continue without accountId
          }
        }

        let pdfUrl = `${apiEndpoint}/api/drive/files/${pdfFileId}`;
        if (accountIdToUse && accountIdToUse.includes('::')) {
          pdfUrl += `?accountId=${encodeURIComponent(accountIdToUse)}`;
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
        loadingPagesRef.current.delete(pageNum);
        return;
      }
      
      // Load thumbnail - EXACT COPY of FullScreenFeed pattern
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const { PNOAuthService } = await import('../services/pnOAuthService');
      const accessToken = await PNOAuthService.getValidAccessToken();
      
      if (!accessToken) {
        console.warn(`[ImageSlideshow] No access token for thumbnail ${thumbnailId}`);
        failedPagesRef.current.add(pageNum);
        loadingPagesRef.current.delete(pageNum);
        return;
      }
      
      // Get accountId like FullScreenFeed does (inside the function, after getting token)
      let accountIdToUse = accountIdHint || accountId;
      if (!accountIdToUse || !accountIdToUse.includes('::')) {
        try {
          const session = PNOAuthService.loadSession();
          if (session?.did || session?.pnIdentifier) {
            const userId = session.pnIdentifier || session.did;
            const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (accountsResponse.ok) {
              const accountsData = await accountsResponse.json();
              const accounts = accountsData.accounts || [];
              if (accounts.length > 0) {
                accountIdToUse = accounts[0].accountId;
              }
            }
          }
        } catch (err) {
          console.warn(`[ImageSlideshow] Failed to fetch accountId for thumbnail:`, err);
        }
      }
      
      // Build URL with accountId
      let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailId}?thumbnail=true`;
      if (accountIdToUse && accountIdToUse.includes('::')) {
        thumbnailUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
      }
      
      // Fetch with auth token (EXACT pattern from FullScreenFeed)
      let response: Response;
      try {
        response = await fetch(thumbnailUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.status === 401) {
          const refreshedToken = await PNOAuthService.getValidAccessToken(true);
          if (refreshedToken) {
            response = await fetch(thumbnailUrl, {
              headers: { 'Authorization': `Bearer ${refreshedToken}` }
            });
          }
        }
      } catch (fetchError: any) {
        console.error(`[ImageSlideshow] Fetch error for thumbnail ${thumbnailId}:`, fetchError);
        failedPagesRef.current.add(pageNum);
        loadingPagesRef.current.delete(pageNum);
        return;
      }
      
      // Check response status BEFORE reading blob
      if (!response.ok) {
        if (response.status === 401) {
          console.warn(`[ImageSlideshow] Thumbnail ${thumbnailId} requires authentication`);
        } else {
          console.warn(`[ImageSlideshow] Thumbnail ${thumbnailId} failed: ${response.status}`);
        }
        failedPagesRef.current.add(pageNum);
        loadingPagesRef.current.delete(pageNum);
        return;
      }
      
      // Only read blob if response is OK (status 200)
      const contentType = response.headers.get('content-type') || '';
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (blobError) {
        console.error(`[ImageSlideshow] Failed to read blob for thumbnail ${thumbnailId}:`, blobError);
        failedPagesRef.current.add(pageNum);
        loadingPagesRef.current.delete(pageNum);
        return;
      }
      
      let imageUrl: string;
      // Check if this is an encrypted file (JSON with encrypted package structure)
      if (contentType.includes('application/json')) {
        // Could be encrypted file OR error JSON - check content
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);
          
          // Validate it's actually an encrypted package before attempting decryption
          // Must have all required fields and they must be strings
          if (parsed.encrypted && parsed.iv && parsed.salt && 
              typeof parsed.encrypted === 'string' && 
              typeof parsed.iv === 'string' && 
              typeof parsed.salt === 'string') {
            // Encrypted file - need session to decrypt
            const { EncryptionManager } = await import('../utils/encryptionManager');
            const session = PNOAuthService.loadSession();
            if (!session?.did) {
              console.warn(`[ImageSlideshow] Cannot decrypt thumbnail ${thumbnailId} - no session`);
              failedPagesRef.current.add(pageNum);
              loadingPagesRef.current.delete(pageNum);
              return;
            }
            
            const pnId = session.did;
            let publicKey = session?.publicKey;
            if (!publicKey && session.did.startsWith('did:key:')) {
              publicKey = session.did.substring(8);
            }
            if (!publicKey) {
              console.warn(`[ImageSlideshow] Cannot decrypt thumbnail ${thumbnailId} - no public key`);
              failedPagesRef.current.add(pageNum);
              loadingPagesRef.current.delete(pageNum);
              return;
            }
            
            try {
              const encryptionManager = new EncryptionManager();
              const decryptedData = await encryptionManager.decrypt(
                parsed.encrypted,
                parsed.iv,
                parsed.salt,
                pnId,
                publicKey
              );
              
              const decryptedBlob = new Blob([decryptedData], {
                type: parsed.metadata?.originalMimeType || 'image/jpeg'
              });
              imageUrl = URL.createObjectURL(decryptedBlob);
            } catch (decryptError) {
              console.error(`[ImageSlideshow] Failed to decrypt thumbnail ${thumbnailId}:`, decryptError);
              failedPagesRef.current.add(pageNum);
              loadingPagesRef.current.delete(pageNum);
              return;
            }
          } else {
            // Not an encrypted package - might be error JSON, skip it
            console.warn(`[ImageSlideshow] Unexpected JSON response for thumbnail ${thumbnailId}:`, parsed);
            failedPagesRef.current.add(pageNum);
            loadingPagesRef.current.delete(pageNum);
            return;
          }
        } catch (parseError) {
          // Not valid JSON - treat as error
          console.error(`[ImageSlideshow] Failed to parse JSON response for thumbnail ${thumbnailId}:`, parseError);
          failedPagesRef.current.add(pageNum);
          loadingPagesRef.current.delete(pageNum);
          return;
        }
      } else if (contentType.includes('application/octet-stream')) {
        // Octet stream might be encrypted - try to decrypt if session available
        const session = PNOAuthService.loadSession();
        if (session?.did) {
          try {
            const text = await blob.text();
            const parsed = JSON.parse(text);
            if (parsed.encrypted && parsed.iv && parsed.salt) {
              // Encrypted - decrypt it
              const { EncryptionManager } = await import('../utils/encryptionManager');
              const pnId = session.did;
              let publicKey = session?.publicKey;
              if (!publicKey && session.did.startsWith('did:key:')) {
                publicKey = session.did.substring(8);
              }
              if (publicKey) {
                const encryptionManager = new EncryptionManager();
                const decryptedData = await encryptionManager.decrypt(
                  parsed.encrypted,
                  parsed.iv,
                  parsed.salt,
                  pnId,
                  publicKey
                );
                const decryptedBlob = new Blob([decryptedData], {
                  type: parsed.metadata?.originalMimeType || 'image/jpeg'
                });
                imageUrl = URL.createObjectURL(decryptedBlob);
              } else {
                failedPagesRef.current.add(pageNum);
                loadingPagesRef.current.delete(pageNum);
                return;
              }
            } else {
              // Not encrypted - use directly
              imageUrl = URL.createObjectURL(blob);
            }
          } catch (e) {
            // Not JSON - use directly
            imageUrl = URL.createObjectURL(blob);
          }
        } else {
          // No session - can't decrypt, skip
          console.warn(`[ImageSlideshow] Cannot decrypt octet-stream thumbnail ${thumbnailId} - no session`);
          failedPagesRef.current.add(pageNum);
          loadingPagesRef.current.delete(pageNum);
          return;
        }
      } else {
        // Image file (jpeg, png, etc.) - use directly
        imageUrl = URL.createObjectURL(blob);
      }
      
      // Success! Update state
      loadedPagesRef.current.add(pageNum);
      failedPagesRef.current.delete(pageNum); // Remove from failed if it was there
      setPageUrls(prev => new Map(prev).set(pageNum, imageUrl));
      setPageIsThumbnail(prev => new Map(prev).set(pageNum, true));
      
      // Preload full-size PDF rendering in background if available
      if (pdfFileId && !fullSizeLoadedRef.current.has(pageNum)) {
        loadThumbnail(thumbnailId, pageNum, accountIdToUse, true).catch(() => {});
      }
    } catch (err) {
      console.error(`❌ [ImageSlideshow] Failed to load page ${pageNum}:`, err);
      failedPagesRef.current.add(pageNum);
    } finally {
      loadingPagesRef.current.delete(pageNum);
    }
  }, [pdfFileId]);

  // Load ALL thumbnails in PARALLEL immediately (no delays, no blocking)
  useEffect(() => {
    if (thumbnailIds.length === 0) return;
    
    let cancelled = false;
    
    // Start loading ALL thumbnails in parallel immediately
    // Don't wait for accountId - start fetching right away
    (async () => {
      // Fetch accountId in background (non-blocking)
      const accountIdPromise = fetchAccountIdOnce();
      
      // Start loading all thumbnails immediately in parallel
      const loadPromises = thumbnailIds.map(async (thumbnailId, index) => {
        if (cancelled) return;
        
        const pageNum = index + 1;
        // Don't wait for accountId - start fetch immediately, accountId will be used if available
        const accountIdToUse = await accountIdPromise;
        await loadThumbnail(thumbnailId, pageNum, accountIdToUse, false);
      });
      
      // Don't await - let them load in parallel
      Promise.all(loadPromises).catch(() => {
        // Errors already handled in loadThumbnail
      });
    })();
    
    return () => {
      cancelled = true;
    };
  }, [thumbnailIds, fetchAccountIdOnce, loadThumbnail]);

  // Load full-size PDF pages on-demand when navigating
  useEffect(() => {
    if (thumbnailIds.length === 0 || !pdfFileId) return;
    
    const pagesToLoad = [
      currentPage,
      currentPage + 1,
      currentPage - 1
    ].filter(p => p >= 1 && p <= thumbnailIds.length);
    
    (async () => {
      const finalAccountId = await fetchAccountIdOnce();
      
      for (const pageNum of pagesToLoad) {
        const thumbnailId = thumbnailIds[pageNum - 1];
        const currentlyThumbnail = pageIsThumbnail.get(pageNum);
        const shouldLoadFullSize = pageNum === currentPage && currentlyThumbnail;
        
        if (thumbnailId && shouldLoadFullSize && !fullSizeLoadedRef.current.has(pageNum)) {
          loadThumbnail(thumbnailId, pageNum, finalAccountId, true).catch(() => {});
        }
      }
    })();
  }, [currentPage, thumbnailIds, pdfFileId, fetchAccountIdOnce, loadThumbnail, pageIsThumbnail]);

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

  // Show error only if we have an error AND no pages to show
  if (error && pages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-red-400">Error loading slideshow</p>
          <p className="text-sm text-gray-400 mt-2">{error}</p>
        </div>
      </div>
    );
  }
  
  // If no pages and no thumbnail IDs, show a message
  if (pages.length === 0 && thumbnailIds.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-white/70">No slideshow content available</p>
        </div>
      </div>
    );
  }

  // RENDER IMMEDIATELY - don't wait for anything
  // Pages are initialized synchronously, so slideshow structure shows instantly
  console.log(`[ImageSlideshow] Rendering slideshow with ${pages.length} pages, ${pageUrls.size} loaded, ${failedPagesRef.current.size} failed`);

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
            const hasFailed = failedPagesRef.current.has(pageNum);
            
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
                ) : hasFailed ? (
                  <div className="text-white/50 text-center">
                    <p className="text-sm">Page {pageNum}</p>
                    <p className="text-xs mt-1 opacity-70">Authentication required</p>
                  </div>
                ) : (
                  // Show placeholder immediately - no loading spinner to avoid "loading screen" appearance
                  <div className="text-white/40 text-center">
                    <p className="text-sm">Page {pageNum}</p>
                    {isLoading && (
                      <p className="text-xs mt-1 opacity-50">Loading...</p>
                    )}
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
