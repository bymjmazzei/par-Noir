/**
 * Image Slideshow Component
 * Displays image files from a folder as a horizontal scrolling slideshow with snap-to-page navigation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';

interface ImageSlideshowProps {
  fileId: string; // Folder ID containing thumbnails
  fileName?: string;
  accountId?: string; // Account ID for downloading images
  pdfFileId?: string; // PDF file ID for on-demand rendering (if PDF slideshow)
}

export function ImageSlideshow({ fileId, fileName, accountId, pdfFileId }: ImageSlideshowProps) {
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // State for folder-based image pages
  const [folderPageFiles, setFolderPageFiles] = useState<Array<{ 
    id: string; 
    name: string; 
    pageNum: number;
    thumbnailId?: string; // Thumbnail file ID (if available)
    fullSizeId: string; // Full-size file ID
  }>>([]);
  const [pageUrls, setPageUrls] = useState<Map<number, string>>(new Map());
  const [pageIsThumbnail, setPageIsThumbnail] = useState<Map<number, boolean>>(new Map()); // Track if current URL is thumbnail
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const fullSizeLoadedRef = useRef<Set<number>>(new Set()); // Track which pages have full-size loaded

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

        // Use provided accountId, or fetch once and cache it
        let finalAccountId = accountId;
        if (!finalAccountId || !finalAccountId.includes('::')) {
          // Cache accountId in session storage to avoid repeated API calls
          const cachedAccountId = sessionStorage.getItem('slideshow_accountId');
          if (cachedAccountId && cachedAccountId.includes('::')) {
            finalAccountId = cachedAccountId;
            console.log(`[ImageSlideshow] Using cached accountId: ${finalAccountId}`);
          } else {
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
                    sessionStorage.setItem('slideshow_accountId', finalAccountId); // Cache it
                    console.log(`[ImageSlideshow] Fetched and cached accountId: ${finalAccountId}`);
                  }
                }
              }
            } catch (err) {
              console.warn(`[ImageSlideshow] Failed to fetch accountId, continuing without it:`, err);
            }
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
        
        // Separate thumbnails and full-size pages, then match them together
        const thumbnails = new Map<number, { id: string; name: string }>();
        const fullSizePages = new Map<number, { id: string; name: string }>();
        
        files.forEach((file: any) => {
          // Check for thumbnail: "thumb_{name}-page-{num}.png.encrypted"
          const thumbMatch = file.name.match(/^thumb_(.+)-page-(\d+)\.png\.encrypted$/i);
          if (thumbMatch) {
            const pageNum = parseInt(thumbMatch[2], 10);
            thumbnails.set(pageNum, { id: file.id, name: file.name });
            return;
          }
          
          // Check for full-size: "{name}-page-{num}.png.encrypted" (not starting with thumb_)
          const fullMatch = file.name.match(/^(.+)-page-(\d+)\.png\.encrypted$/i);
          if (fullMatch && !file.name.toLowerCase().startsWith('thumb_')) {
            const pageNum = parseInt(fullMatch[2], 10);
            fullSizePages.set(pageNum, { id: file.id, name: file.name });
          }
        });
        
        // Combine thumbnails and full-size pages, matching by page number
        const pageFiles: Array<{ 
          id: string; 
          name: string; 
          pageNum: number;
          thumbnailId?: string;
          fullSizeId: string;
        }> = [];
        
        // Use thumbnails as the base (we now only generate thumbnails, not full-size PNGs)
        // If we have full-size pages (legacy), use those; otherwise use thumbnails
        if (fullSizePages.size > 0) {
          // Legacy format: full-size pages exist
          fullSizePages.forEach((fullSize, pageNum) => {
            pageFiles.push({
              id: fullSize.id,
              name: fullSize.name,
              pageNum,
              thumbnailId: thumbnails.get(pageNum)?.id,
              fullSizeId: fullSize.id
            });
          });
        } else {
          // New format: only thumbnails exist (use thumbnails as both thumbnail and "fullSize" ID)
          // When pdfFileId is available, full-size will be rendered from PDF on-demand
          thumbnails.forEach((thumb, pageNum) => {
            pageFiles.push({
              id: thumb.id, // Use thumbnail ID as default
              name: thumb.name,
              pageNum,
              thumbnailId: thumb.id,
              fullSizeId: thumb.id // Use thumbnail ID as fallback (PDF rendering will override)
            });
          });
        }
        
        // Sort by page number
        pageFiles.sort((a, b) => a.pageNum - b.pageNum);
        
        console.log(`✅ [ImageSlideshow] Found ${pageFiles.length} pages (${thumbnails.size} thumbnails, ${fullSizePages.size} full-size)`);
        
        if (pageFiles.length > 0) {
          setFolderPageFiles(pageFiles);
          setPages(Array.from({ length: pageFiles.length }, (_, i) => i + 1));
          setCurrentPage(1);
          setLoading(false); // Show slideshow UI immediately, pages will decrypt progressively
          console.log(`[ImageSlideshow] ✅ Folder pages loaded, set loading=false (pages will decrypt progressively)`);
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

  // Fetch accountId helper (shared between useEffects)
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

  // Load individual image page (shared function)
  // If loadFullSize is false, loads thumbnail first; if true or thumbnail unavailable, loads full-size
  const loadImagePage = useCallback(async (
    pageFile: { id: string; name: string; pageNum: number; thumbnailId?: string; fullSizeId: string }, 
    finalAccountId: string | null,
    loadFullSize: boolean = false
  ) => {
      const pageNum = pageFile.pageNum;
      
      // Skip if full-size already loaded, or if currently loading
      if (loadFullSize && fullSizeLoadedRef.current.has(pageNum)) {
        console.log(`[ImageSlideshow] Skipping page ${pageNum} (full-size already loaded)`);
        return;
      }
      if (loadingPagesRef.current.has(pageNum)) {
        console.log(`[ImageSlideshow] Skipping page ${pageNum} (already loading)`);
        return;
      }
      
      // Determine which file to load: thumbnail first (if available and not forcing full-size), otherwise render PDF on-demand
      const hasThumbnail = !!pageFile.thumbnailId;
      const shouldLoadThumbnail = hasThumbnail && !loadFullSize && !fullSizeLoadedRef.current.has(pageNum);
      const shouldRenderPDF = loadFullSize && pdfFileId && !fullSizeLoadedRef.current.has(pageNum);
      const fileIdToLoad = shouldLoadThumbnail ? pageFile.thumbnailId! : pageFile.fullSizeId;
      const isThumbnailLoad = shouldLoadThumbnail;
      
      console.log(`[ImageSlideshow] Loading ${isThumbnailLoad ? 'thumbnail' : shouldRenderPDF ? 'PDF page' : 'full-size'} for page ${pageNum}...`);
      loadingPagesRef.current.add(pageNum);
      setLoadingPages(prev => new Set(prev).add(pageNum));

      try {
        // If we need to render PDF page on-demand
        if (shouldRenderPDF && pdfFileId) {
          const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
          const { PNOAuthService } = await import('../services/pnOAuthService');
          const accessToken = await PNOAuthService.getValidAccessToken();
          
          if (!accessToken) {
            throw new Error('No access token');
          }

          // Download PDF file
          let pdfUrl = `${apiEndpoint}/api/drive/files/${pdfFileId}`;
          if (finalAccountId && finalAccountId.includes('::')) {
            pdfUrl += `?accountId=${encodeURIComponent(finalAccountId)}`;
          }
          
          console.log(`[ImageSlideshow] Fetching PDF for on-demand rendering of page ${pageNum}...`);
          const startTime = Date.now();
          
          let response = await fetch(pdfUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          
          if (response.status === 401) {
            const refreshedToken = await PNOAuthService.getValidAccessToken(true);
            if (refreshedToken) {
              response = await fetch(pdfUrl, {
                headers: {
                  'Authorization': `Bearer ${refreshedToken}`
                }
              });
            }
          }
          
          if (!response.ok) {
            throw new Error(`Failed to load PDF: ${response.status}`);
          }
          
          const contentType = response.headers.get('content-type') || '';
          const blob = await response.blob();
          
          // Decrypt PDF if encrypted
          let pdfBlob: Blob;
          if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
            const { EncryptionManager } = await import('../utils/encryptionManager');
            
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
            
            const encryptedText = await blob.text();
            const encryptedPackage: EncryptedFilePackage = JSON.parse(encryptedText);
            
            const encryptionManager = new EncryptionManager();
            const decryptedData = await encryptionManager.decrypt(
              encryptedPackage.encrypted,
              encryptedPackage.iv,
              encryptedPackage.salt,
              pnId,
              publicKey
            );
            
            pdfBlob = new Blob([decryptedData], {
              type: 'application/pdf'
            });
          } else {
            pdfBlob = blob;
          }
          
          // Render PDF page using PDF.js
          const pdfjsLib = await import('pdfjs-dist');
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
          }
          
          const arrayBuffer = await pdfBlob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
          const pdf = await loadingTask.promise;
          
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // High quality
          
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Failed to get canvas context');
          }
          
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;
          
          // Convert canvas to blob
          const imageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            }, 'image/png', 1.0);
          });
          
          const imageUrl = URL.createObjectURL(imageBlob);
          const loadTime = Date.now() - startTime;
          console.log(`✅ [ImageSlideshow] Rendered PDF page ${pageNum} on-demand in ${loadTime}ms`);
          
          fullSizeLoadedRef.current.add(pageNum);
          setPageUrls(prev => {
            const next = new Map(prev);
            next.set(pageNum, imageUrl);
            return next;
          });
          setPageIsThumbnail(prev => {
            const next = new Map(prev);
            next.set(pageNum, false); // This is full-size, not thumbnail
            return next;
          });
          
          return;
        }
        
        // Otherwise, load thumbnail or full-size image as before
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        // Use thumbnail endpoint - for encrypted files, API will return the full encrypted file
        // which we'll decrypt client-side
        let fetchUrl = `${apiEndpoint}/api/drive/files/${fileIdToLoad}?thumbnail=true`;
        // Add accountId if we have a valid one
        if (finalAccountId && finalAccountId.includes('::')) {
          fetchUrl += `&accountId=${encodeURIComponent(finalAccountId)}`;
        }
        
        console.log(`[ImageSlideshow] Fetching ${isThumbnailLoad ? 'thumbnail' : 'full-size'} for page ${pageNum} from:`, fetchUrl);
        const startTime = Date.now();
        
        let response = await fetch(fetchUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        // If we get 401, refresh token and retry once
        if (response.status === 401) {
          console.log(`[ImageSlideshow] Got 401 for page ${pageNum}, refreshing token and retrying...`);
          const refreshedToken = await PNOAuthService.getValidAccessToken(true); // Force refresh
          if (refreshedToken) {
            response = await fetch(fetchUrl, {
              headers: {
                'Authorization': `Bearer ${refreshedToken}`
              }
            });
          }
        }
        
        if (!response.ok) {
          // If thumbnail load failed but we have PDF for on-demand rendering, try that
          if (isThumbnailLoad && pdfFileId) {
            console.log(`[ImageSlideshow] Thumbnail failed for page ${pageNum}, will render from PDF on-demand...`);
            loadingPagesRef.current.delete(pageNum);
            return loadImagePage(pageFile, finalAccountId, true); // Retry with PDF rendering
          }
          // If thumbnail load failed but we have a full-size option, try that
          if (isThumbnailLoad && pageFile.fullSizeId) {
            console.log(`[ImageSlideshow] Thumbnail failed for page ${pageNum}, falling back to full-size...`);
            loadingPagesRef.current.delete(pageNum);
            return loadImagePage(pageFile, finalAccountId, true); // Retry with full-size
          }
          throw new Error(`Failed to load page ${pageNum} ${isThumbnailLoad ? 'thumbnail' : 'full-size'}: ${response.status}`);
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
          console.log(`✅ [ImageSlideshow] Decrypted ${isThumbnailLoad ? 'thumbnail' : 'full-size'} page ${pageNum}`);
        } else {
          // Direct image (non-encrypted or already decrypted by API)
          imageUrl = URL.createObjectURL(blob);
        }
        
        const loadTime = Date.now() - startTime;
        console.log(`✅ [ImageSlideshow] Loaded ${isThumbnailLoad ? 'thumbnail' : 'full-size'} page ${pageNum} in ${loadTime}ms`);
        
        // Update state
        loadedPagesRef.current.add(pageNum);
        if (!isThumbnailLoad) {
          fullSizeLoadedRef.current.add(pageNum);
        }
        
        setPageUrls(prev => {
          const next = new Map(prev);
          next.set(pageNum, imageUrl);
          return next;
        });
        setPageIsThumbnail(prev => {
          const next = new Map(prev);
          next.set(pageNum, isThumbnailLoad);
          return next;
        });
        
        // If we loaded a thumbnail and PDF is available, preload PDF rendering in background
        if (isThumbnailLoad && pdfFileId && !fullSizeLoadedRef.current.has(pageNum)) {
          console.log(`[ImageSlideshow] Preloading PDF page ${pageNum} rendering in background...`);
          // Don't await - let it load in background
          loadImagePage(pageFile, finalAccountId, true).catch(err => {
            console.warn(`[ImageSlideshow] Background PDF rendering failed for page ${pageNum}:`, err);
          });
        }
      } catch (err) {
        console.error(`❌ [ImageSlideshow] Failed to load image page ${pageNum}:`, err);
      } finally {
        loadingPagesRef.current.delete(pageNum);
        setLoadingPages(prev => {
          const next = new Set(prev);
          next.delete(pageNum);
          return next;
        });
      }
    }, [pdfFileId]);

  // Load thumbnails sequentially (like the feed) to avoid blocking UI with decryption
  // Decryption is CPU-intensive and blocks the main thread, so sequential loading feels smoother
  useEffect(() => {
    if (folderPageFiles.length === 0) return;
    
    let cancelled = false;
    
    (async () => {
      const finalAccountId = await fetchAccountIdOnce();
      
      // Start loading first page immediately (don't await - let UI show while decrypting)
      // The page will appear when decryption completes (~2-3 seconds)
      if (folderPageFiles.length > 0 && !cancelled) {
        loadImagePage(folderPageFiles[0], finalAccountId, false).catch(err => {
          console.warn('[ImageSlideshow] Failed to load first page:', err);
        });
      }
      
      // Load remaining pages sequentially in background (non-blocking)
      // This matches the feed's behavior - smooth scrolling, no UI blocking
      for (let i = 1; i < folderPageFiles.length; i++) {
        if (cancelled) break;
        
        // Small delay between loads to prevent UI blocking
        // Decryption is CPU-intensive, so spacing it out feels smoother
        await new Promise(resolve => setTimeout(resolve, 100));
        await loadImagePage(folderPageFiles[i], finalAccountId, false);
      }
    })();
    
    return () => {
      cancelled = true;
    };
  }, [folderPageFiles, accountId, loadImagePage]);

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

  // Load pages on-demand when navigating
  useEffect(() => {
    if (folderPageFiles.length === 0) return;
    
    // Load current page and adjacent pages if not already loaded
    const pagesToLoad = [
      currentPage,
      currentPage + 1, // Next page
      currentPage - 1  // Previous page
    ].filter(p => p >= 1 && p <= pages.length);
    
    (async () => {
      const finalAccountId = await fetchAccountIdOnce();
      
      pagesToLoad.forEach(pageNum => {
        const pageFile = folderPageFiles.find(f => f.pageNum === pageNum);
        if (pageFile && !loadedPagesRef.current.has(pageNum) && !loadingPagesRef.current.has(pageNum)) {
          // Current page: upgrade to full-size if thumbnail is shown; adjacent pages: load thumbnails
          const isCurrentPage = pageNum === currentPage;
          const currentlyThumbnail = pageIsThumbnail.get(pageNum);
          const shouldLoadFullSize = isCurrentPage && currentlyThumbnail;
          loadImagePage(pageFile, finalAccountId, shouldLoadFullSize);
        }
      });
    })();
  }, [currentPage, folderPageFiles, accountId, pages.length, loadImagePage]);

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

