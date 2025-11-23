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
  pdfPageFileIds?: string[]; // Pre-rendered PNG page file IDs for fast loading
  accountId?: string; // Account ID for downloading PNG pages
}

export function PDFSlideshow({ fileId, publicToken, fileName, pdfPageFileIds, accountId }: PDFSlideshowProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usePreRenderedPages, setUsePreRenderedPages] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load pre-rendered PNG pages if available (much faster than PDF.js rendering)
  useEffect(() => {
    console.log(`[PDFSlideshow] Checking for pre-rendered pages:`, { 
      pdfPageFileIds, 
      hasPages: pdfPageFileIds && pdfPageFileIds.length > 0,
      count: pdfPageFileIds?.length 
    });
    
    if (!pdfPageFileIds || pdfPageFileIds.length === 0) {
      console.log(`[PDFSlideshow] No pre-rendered pages, will use PDF.js`);
      setUsePreRenderedPages(false);
      return;
    }

    // Initialize pre-rendered pages mode
    console.log(`✅ [PDFSlideshow] Using ${pdfPageFileIds.length} pre-rendered PNG pages for fast loading`);
    setUsePreRenderedPages(true);
    setPages(Array.from({ length: pdfPageFileIds.length }, (_, i) => i + 1));
    setCurrentPage(1);
    setLoading(false);
  }, [pdfPageFileIds]);

  // Load and decrypt PDF (fallback if no pre-rendered pages)
  useEffect(() => {
    if (usePreRenderedPages) return; // Skip if using pre-rendered pages

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

  // Load pre-rendered PNG pages from file IDs
  const [preRenderedPageUrls, setPreRenderedPageUrls] = useState<Map<number, string>>(new Map());
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!usePreRenderedPages || !pdfPageFileIds || pdfPageFileIds.length === 0) {
      console.log(`[PDFSlideshow] Skipping PNG load:`, { usePreRenderedPages, pdfPageFileIds: pdfPageFileIds?.length });
      return;
    }

    console.log(`[PDFSlideshow] Starting to load ${pdfPageFileIds.length} PNG pages...`);

    const loadPreRenderedPage = async (pageNum: number, pageFileId: string) => {
      // Skip if already loaded or currently loading
      if (loadedPagesRef.current.has(pageNum) || loadingPages.has(pageNum)) {
        console.log(`[PDFSlideshow] Skipping page ${pageNum} (already loaded/loading)`);
        return;
      }
      
      console.log(`[PDFSlideshow] Loading PNG page ${pageNum}/${pdfPageFileIds.length}...`);
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
          ? `${apiEndpoint}/api/drive/files/${pageFileId}?accountId=${encodeURIComponent(accountId)}&thumbnail=true`
          : `${apiEndpoint}/api/drive/files/${pageFileId}?thumbnail=true`;
        
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
    pdfPageFileIds.forEach((pageFileId, index) => {
      const pageNum = index + 1;
      if (!loadedPagesRef.current.has(pageNum)) {
        loadPreRenderedPage(pageNum, pageFileId); // Don't await - load in parallel
      }
    });
  }, [usePreRenderedPages, pdfPageFileIds, accountId]);

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
          <p>Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-red-400">Error loading PDF</p>
          <p className="text-sm text-gray-400 mt-2">{error}</p>
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

