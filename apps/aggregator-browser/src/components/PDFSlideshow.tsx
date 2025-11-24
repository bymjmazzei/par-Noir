/**
 * PDF Slideshow Component
 * Displays PDF files as a horizontal scrolling slideshow with snap-to-page navigation
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';

interface PDFSlideshowProps {
  fileId: string;
  publicToken: string | ShareToken | object;
  fileName?: string;
  pdfPagesFolderId?: string; // Folder ID containing pre-rendered PNG pages
  accountId?: string; // Account ID for downloading PNG pages
}

export function PDFSlideshow({ fileId, publicToken, fileName, pdfPagesFolderId, accountId }: PDFSlideshowProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usePreRenderedPages, setUsePreRenderedPages] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // State for folder-based PNG pages
  const [folderPageFiles, setFolderPageFiles] = useState<Array<{ id: string; name: string; pageNum: number }>>([]);

  // Load pre-rendered PNG pages from folder if available (much faster than PDF.js rendering)
  useEffect(() => {
    console.log(`[PDFSlideshow] Checking for PDF pages folder:`, { 
      pdfPagesFolderId,
      hasFolder: !!pdfPagesFolderId
    });
    
    if (!pdfPagesFolderId) {
      console.log(`[PDFSlideshow] No PDF pages folder, will use PDF.js`);
      setUsePreRenderedPages(false);
      return;
    }

    // List files in folder
    const loadFolderPages = async () => {
      try {
        setLoading(true);
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        // Query files in folder using Google Drive API query
        const folderQuery = `'${pdfPagesFolderId}' in parents and trashed=false`;
        const filesUrl = `${apiEndpoint}/api/drive/files?q=${encodeURIComponent(folderQuery)}&pageSize=1000${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`;
        
        console.log(`[PDFSlideshow] Fetching files from folder:`, filesUrl);
        
        const response = await fetch(filesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
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
        
        console.log(`✅ [PDFSlideshow] Found ${pageFiles.length} PNG pages in folder`);
        
        if (pageFiles.length > 0) {
          setFolderPageFiles(pageFiles);
          setUsePreRenderedPages(true);
          setPages(Array.from({ length: pageFiles.length }, (_, i) => i + 1));
          setCurrentPage(1);
          setLoading(false);
        } else {
          console.warn(`⚠️ [PDFSlideshow] No PNG pages found in folder, falling back to PDF.js`);
          setUsePreRenderedPages(false);
          setLoading(false);
        }
      } catch (err: any) {
        console.error(`❌ [PDFSlideshow] Failed to load folder pages:`, err);
        setUsePreRenderedPages(false);
        setLoading(false);
      }
    };

    loadFolderPages();
  }, [pdfPagesFolderId, accountId]);

  // Load and decrypt PDF (fallback if no pre-rendered pages)
  // NOTE: If pdfPagesFolderId is provided and equals fileId, this is a folder-based slideshow (no PDF to load)
  useEffect(() => {
    if (usePreRenderedPages) return; // Skip if using pre-rendered pages
    if (pdfPagesFolderId && pdfPagesFolderId === fileId) return; // Skip if folder IS the file (image slideshow, not PDF)

    const loadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        // Decrypt PDF file
        // Handle token type - decryptWithToken expects ShareToken
        const token: ShareToken = typeof publicToken === 'string' 
          ? JSON.parse(publicToken) 
          : publicToken as ShareToken;
        const blob = await decryptWithToken(token);
        setPdfBlob(blob);
        
        // Convert blob to ArrayBuffer for PDF.js (avoids blob URL XHR issues)
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Create object URL for display purposes (but don't use for PDF.js)
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        // Load PDF.js dynamically
        const pdfjsLib = await import('pdfjs-dist');
        // Ensure worker is set (should already be set globally, but set as fallback)
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        // Load PDF document using data directly instead of URL (avoids blob URL XHR issues)
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;
        
        // Get number of pages
        const numPages = pdf.numPages;
        setPages(Array.from({ length: numPages }, (_, i) => i + 1));
        setCurrentPage(1);
        setLoading(false);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        setError(err.message || 'Failed to load PDF');
        setLoading(false);
      }
    };

    loadPDF();

    // Cleanup
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [publicToken, usePreRenderedPages]);

  // Load pre-rendered PNG pages from folder files
  const [preRenderedPageUrls, setPreRenderedPageUrls] = useState<Map<number, string>>(new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!usePreRenderedPages || folderPageFiles.length === 0) {
      return;
    }

    console.log(`[PDFSlideshow] Starting to load ${folderPageFiles.length} PNG pages from folder...`);

    const loadPreRenderedPage = async (pageFile: { id: string; name: string; pageNum: number }) => {
      const pageNum = pageFile.pageNum;
      
      // Skip if already loaded or currently loading
      if (loadedPagesRef.current.has(pageNum) || loadingPages.has(pageNum)) {
        console.log(`[PDFSlideshow] Skipping page ${pageNum} (already loaded/loading)`);
        return;
      }
      
      console.log(`[PDFSlideshow] Loading PNG page ${pageNum}/${folderPageFiles.length}...`);
      setLoadingPages(prev => new Set(prev).add(pageNum));
      
      try {
        const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
        const { PNOAuthService } = await import('../services/pnOAuthService');
        const accessToken = await PNOAuthService.getValidAccessToken();
        
        if (!accessToken) {
          throw new Error('No access token');
        }

        // Use thumbnail endpoint which returns decrypted image
        const thumbnailUrl = accountId
          ? `${apiEndpoint}/api/drive/files/${pageFile.id}?accountId=${encodeURIComponent(accountId)}&thumbnail=true`
          : `${apiEndpoint}/api/drive/files/${pageFile.id}?thumbnail=true`;
        
        console.log(`[PDFSlideshow] Fetching thumbnail for page ${pageNum} from:`, thumbnailUrl);
        const startTime = Date.now();
        
        const response = await fetch(thumbnailUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to load page ${pageNum} thumbnail: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const loadTime = Date.now() - startTime;
        
        console.log(`✅ [PDFSlideshow] Loaded PNG page ${pageNum} in ${loadTime}ms`);
        
        loadedPagesRef.current.add(pageNum);
        setPreRenderedPageUrls(prev => {
          const next = new Map(prev);
          next.set(pageNum, url);
          return next;
        });
      } catch (err) {
        console.error(`❌ [PDFSlideshow] Failed to load pre-rendered page ${pageNum}:`, err);
      } finally {
        setLoadingPages(prev => {
          const next = new Set(prev);
          next.delete(pageNum);
          return next;
        });
      }
    };

    // Load all pages in parallel for faster loading
    folderPageFiles.forEach((pageFile) => {
      if (!loadedPagesRef.current.has(pageFile.pageNum)) {
        loadPreRenderedPage(pageFile); // Don't await - load in parallel
      }
    });
  }, [usePreRenderedPages, folderPageFiles, accountId]);

  // Render PDF pages as images (progressive - first page immediately, others in background)
  // Only used if NOT using pre-rendered pages
  const [renderedPages, setRenderedPages] = useState<Map<number, string>>(new Map());
  const [renderingPages, setRenderingPages] = useState<Set<number>>(new Set());
  const renderedPagesRef = useRef<Map<number, string>>(new Map());
  const renderingPagesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (usePreRenderedPages || !pdfBlob || pages.length === 0) return;

    const renderPages = async () => {
      try {
        if (!pdfBlob) return;
        
        // Convert blob to ArrayBuffer for PDF.js (avoids blob URL XHR issues)
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const pdfjsLib = await import('pdfjs-dist');
        // Ensure worker is set before loading document
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        // Use data directly instead of URL to avoid blob URL XHR issues
        const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
        const pdf = await loadingTask.promise;

        // Render individual page function
        const renderPage = async (pageNum: number) => {
          // Skip if already rendered or currently rendering (check refs for current state)
          if (renderedPagesRef.current.has(pageNum) || renderingPagesRef.current.has(pageNum)) return;
          
          renderingPagesRef.current.add(pageNum);
          setRenderingPages(prev => new Set(prev).add(pageNum));
          
          try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

            // Create canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
              renderingPagesRef.current.delete(pageNum);
              setRenderingPages(prev => {
                const next = new Set(prev);
                next.delete(pageNum);
                return next;
              });
              return;
            }

            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render page to canvas
            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise;

            // Convert to data URL
            const dataUrl = canvas.toDataURL('image/png');
            
            renderedPagesRef.current.set(pageNum, dataUrl);
            setRenderedPages(prev => {
              const next = new Map(prev);
              next.set(pageNum, dataUrl);
              return next;
            });
          } catch (err) {
            console.error(`Failed to render page ${pageNum}:`, err);
          } finally {
            renderingPagesRef.current.delete(pageNum);
            setRenderingPages(prev => {
              const next = new Set(prev);
              next.delete(pageNum);
              return next;
            });
          }
        };

        // Render first page immediately for instant display
        await renderPage(1);

        // Render other pages in background (with small delay between each to avoid blocking)
        for (let pageNum = 2; pageNum <= pages.length; pageNum++) {
          // Small delay to prevent blocking the UI
          await new Promise(resolve => setTimeout(resolve, 50));
          renderPage(pageNum); // Don't await - render in parallel
        }
      } catch (err) {
        console.error('Failed to render PDF pages:', err);
      }
    };

    renderPages();
  }, [pdfBlob, pages, usePreRenderedPages]);

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

  // Handle horizontal swipe for page navigation
  const horizontalSwipeRef = useHorizontalSwipe({
    onSwipeLeft: () => {
      if (currentPage < pages.length) {
        setCurrentPage(currentPage + 1);
      }
    },
    onSwipeRight: () => {
      if (currentPage > 1) {
        setCurrentPage(currentPage - 1);
      }
    },
    enabled: pages.length > 0,
    threshold: 50,
    snapThreshold: 0.2
  });

  // Handle navigation buttons
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < pages.length) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Handle scroll to detect page changes
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const centerPoint = scrollLeft + containerWidth / 2;

    // Find which page is closest to center
    let closestPage = 1;
    let closestDistance = Infinity;

    pageRefs.current.forEach((element, pageNum) => {
      const elementLeft = element.offsetLeft;
      const elementWidth = element.clientWidth;
      const elementCenter = elementLeft + elementWidth / 2;
      const distance = Math.abs(centerPoint - elementCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = pageNum;
      }
    });

    if (closestPage !== currentPage) {
      setCurrentPage(closestPage);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>{usePreRenderedPages ? 'Loading images...' : 'Loading PDF...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-red-400">Error loading {usePreRenderedPages ? 'images' : 'PDF'}</p>
          <p className="text-sm text-gray-400 mt-2">{error}</p>
        </div>
      </div>
    );
  }
  
  // If no pages loaded yet, show loading state
  if (pages.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading slideshow...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={(el) => {
        if (el && horizontalSwipeRef.current !== el) {
          (horizontalSwipeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }}
      className="w-full h-full flex flex-col bg-black relative"
    >
      {/* Page counter */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-full">
        <span className="text-white text-sm">
          Page {currentPage} of {pages.length}
        </span>
      </div>

      {/* Navigation buttons */}
      {currentPage > 1 && (
        <button
          onClick={handlePreviousPage}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {currentPage < pages.length && (
        <button
          onClick={handleNextPage}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* PDF pages container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
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
            // Use pre-rendered PNG if available, otherwise use PDF.js rendered page
            const pageImageUrl = usePreRenderedPages 
              ? preRenderedPageUrls.get(pageNum)
              : renderedPages.get(pageNum);
            const isLoading = usePreRenderedPages
              ? loadingPages.has(pageNum)
              : renderingPages.has(pageNum);
            
            return (
              <div
                key={pageNum}
                ref={(el) => {
                  if (el) {
                    pageRefs.current.set(pageNum, el);
                  }
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
                    <p className="text-sm">{usePreRenderedPages ? 'Loading' : 'Rendering'} page {pageNum}...</p>
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

