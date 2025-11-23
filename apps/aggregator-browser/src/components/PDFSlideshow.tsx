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
}

export function PDFSlideshow({ fileId, publicToken, fileName }: PDFSlideshowProps) {
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load and decrypt PDF
  useEffect(() => {
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
        
        // Create object URL for PDF
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);

        // Load PDF.js dynamically
        const pdfjsLib = await import('pdfjs-dist');
        // Use jsdelivr CDN which has better CORS support
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

        // Load PDF document
        const loadingTask = pdfjsLib.getDocument({ url });
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
  }, [publicToken]);

  // Render PDF pages as images
  const [renderedPages, setRenderedPages] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (!pdfUrl || pages.length === 0) return;

    const renderPages = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        // Ensure worker is set before loading document
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
        }
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdf = await loadingTask.promise;

        const newRenderedPages = new Map<number, string>();

        // Render all pages
        for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

          // Create canvas
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.height = viewport.height;
          canvas.width = viewport.width;

          // Render page to canvas
          await page.render({
            canvasContext: context,
            viewport: viewport
          }).promise;

          // Convert to data URL
          const dataUrl = canvas.toDataURL('image/png');
          newRenderedPages.set(pageNum, dataUrl);
        }

        setRenderedPages(newRenderedPages);
      } catch (err) {
        console.error('Failed to render PDF pages:', err);
      }
    };

    renderPages();
  }, [pdfUrl, pages]);

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
            const pageImageUrl = renderedPages.get(pageNum);
            
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
                ) : (
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm">Rendering page {pageNum}...</p>
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

