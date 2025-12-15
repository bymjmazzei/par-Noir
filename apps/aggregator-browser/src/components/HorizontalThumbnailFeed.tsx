/**
 * Horizontal Thumbnail Feed Component
 * Displays thumbnails one at a time, full-screen (like vertical feed but horizontal)
 * Swipe left/right to navigate, loads sequentially prioritizing current thumbnail
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHorizontalSwipe } from '../hooks/useHorizontalSwipe';

interface HorizontalThumbnailFeedProps {
  thumbnailIds: string[]; // Array of thumbnail file IDs
  thumbnailTokens?: string[]; // Array of publicTokens for each thumbnail (same order as thumbnailIds) - for public feed decryption
  fileName?: string;
  accountId?: string; // Account ID for downloading images
  onThumbnailClick?: (index: number, thumbnailId: string) => void; // Optional: handle thumbnail clicks
}

export function HorizontalThumbnailFeed({ 
  thumbnailIds, 
  thumbnailTokens,
  fileName, 
  accountId,
  onThumbnailClick 
}: HorizontalThumbnailFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map());
  const loadedThumbnailsRef = useRef<Set<number>>(new Set());
  const loadingThumbnailsRef = useRef<Set<number>>(new Set());
  const failedThumbnailsRef = useRef<Set<number>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Fetch accountId helper (non-blocking)
  const fetchAccountIdOnce = useCallback(async (): Promise<string | null> => {
    if (accountId && accountId.includes('::')) {
      return accountId;
    }
    
    const cachedAccountId = sessionStorage.getItem('thumbnail_feed_accountId');
    if (cachedAccountId && cachedAccountId.includes('::')) {
      return cachedAccountId;
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
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (accountsResponse.ok) {
          const accountsData = await accountsResponse.json();
          const accounts = accountsData.accounts || [];
          if (accounts.length > 0) {
            const accountId = accounts[0].accountId;
            sessionStorage.setItem('thumbnail_feed_accountId', accountId);
            return accountId;
          }
        }
      }
    } catch (err) {
      // Silently fail
    }
    return null;
  }, [accountId]);

  // Load individual thumbnail - EXACT pattern from FullScreenFeed
  const loadThumbnail = useCallback(async (
    thumbnailId: string,
    index: number,
    accountIdHint: string | null,
    thumbnailToken?: string // Optional publicToken for decryption (no auth required)
  ) => {
    // Skip if already loaded, loading, or failed
    if (loadedThumbnailsRef.current.has(index) || 
        loadingThumbnailsRef.current.has(index) ||
        failedThumbnailsRef.current.has(index)) {
      return;
    }

    loadingThumbnailsRef.current.add(index);

    try {
      const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';
      const { PNOAuthService } = await import('../services/pnOAuthService');

      // Get access token FIRST (like FullScreenFeed)
      let accessToken = await PNOAuthService.getValidAccessToken();

      // Get accountId inside function (like FullScreenFeed)
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
          console.warn(`[HorizontalThumbnailFeed] Failed to fetch accountId:`, err);
        }
      }

      // Build URL with accountId
      let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailId}?thumbnail=true`;
      if (accountIdToUse && accountIdToUse.includes('::')) {
        thumbnailUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
      }

      // Fetch with auth token
      let response = await fetch(thumbnailUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      // Retry with refreshed token on 401
      if (response.status === 401) {
        const refreshedToken = await PNOAuthService.getValidAccessToken(true);
        if (refreshedToken) {
          response = await fetch(thumbnailUrl, {
            headers: { 'Authorization': `Bearer ${refreshedToken}` }
          });
        }
      }

      // Check response status
      if (!response.ok || response.status !== 200) {
        console.warn(`[HorizontalThumbnailFeed] Thumbnail ${thumbnailId} failed: ${response.status}`);
        failedThumbnailsRef.current.add(index);
        loadingThumbnailsRef.current.delete(index);
        return;
      }

      // Read blob
      const contentType = response.headers.get('content-type') || '';
      let blob: Blob;
      try {
        blob = await response.blob();
      } catch (blobError) {
        console.error(`[HorizontalThumbnailFeed] Failed to read blob:`, blobError);
        failedThumbnailsRef.current.add(index);
        loadingThumbnailsRef.current.delete(index);
        return;
      }

      let imageUrl: string;
      
      // Handle encrypted files
      if (contentType.includes('application/json')) {
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);

          if (parsed.encrypted && parsed.iv && parsed.salt &&
              typeof parsed.encrypted === 'string' &&
              typeof parsed.iv === 'string' &&
              typeof parsed.salt === 'string') {
            
            // PRIORITY 1: If we have a publicToken, use it for decryption (no auth required)
            if (thumbnailToken) {
              try {
                const { decryptWithToken } = await import('../utils/tokenDecryption');
                let token: ShareToken;
                try {
                  token = typeof thumbnailToken === 'string' ? JSON.parse(thumbnailToken) : thumbnailToken;
                } catch (e) {
                  console.warn(`[HorizontalThumbnailFeed] Failed to parse token for thumbnail ${index}:`, e);
                  // Fall through to session-based decryption
                }
                
                // Decrypt using token (NO AUTH REQUIRED!)
                const decryptedBlob = await decryptWithToken(token);
                imageUrl = URL.createObjectURL(decryptedBlob);
                
                // Success with token!
                loadedThumbnailsRef.current.add(index);
                failedThumbnailsRef.current.delete(index);
                setThumbnailUrls(prev => new Map(prev).set(index, imageUrl));
                return;
              } catch (tokenError) {
                console.warn(`[HorizontalThumbnailFeed] Token decryption failed for thumbnail ${index}, falling back to auth:`, tokenError);
                // Fall through to session-based decryption
              }
            }
            
            // PRIORITY 2: Fall back to session-based decryption (for private files)
            const { EncryptionManager } = await import('../utils/encryptionManager');
            const session = PNOAuthService.loadSession();
            if (!session?.did) {
              console.warn(`[HorizontalThumbnailFeed] Cannot decrypt - no session and no token`);
              failedThumbnailsRef.current.add(index);
              loadingThumbnailsRef.current.delete(index);
              return;
            }

            const pnId = session.did;
            let publicKey = session?.publicKey;
            if (!publicKey && session.did.startsWith('did:key:')) {
              publicKey = session.did.substring(8);
            }
            if (!publicKey) {
              console.warn(`[HorizontalThumbnailFeed] Cannot decrypt - no public key`);
              failedThumbnailsRef.current.add(index);
              loadingThumbnailsRef.current.delete(index);
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
              console.error(`[HorizontalThumbnailFeed] Failed to decrypt:`, decryptError);
              failedThumbnailsRef.current.add(index);
              loadingThumbnailsRef.current.delete(index);
              return;
            }
          } else {
            // Not encrypted package - skip
            console.warn(`[HorizontalThumbnailFeed] Unexpected JSON response:`, parsed);
            failedThumbnailsRef.current.add(index);
            loadingThumbnailsRef.current.delete(index);
            return;
          }
        } catch (parseError) {
          console.error(`[HorizontalThumbnailFeed] Failed to parse JSON:`, parseError);
          failedThumbnailsRef.current.add(index);
          loadingThumbnailsRef.current.delete(index);
          return;
        }
      } else {
        // Image file - use directly
        imageUrl = URL.createObjectURL(blob);
      }

      // Success!
      loadedThumbnailsRef.current.add(index);
      failedThumbnailsRef.current.delete(index);
      setThumbnailUrls(prev => new Map(prev).set(index, imageUrl));
    } catch (err) {
      console.error(`[HorizontalThumbnailFeed] Failed to load thumbnail ${index}:`, err);
      failedThumbnailsRef.current.add(index);
    } finally {
      loadingThumbnailsRef.current.delete(index);
    }
  }, [accountId, thumbnailTokens]);

  // Horizontal swipe navigation (like vertical feed but horizontal)
  const swipeRef = useHorizontalSwipe({
    onSwipeLeft: () => {
      if (currentIndex < thumbnailIds.length - 1) {
        setCurrentIndex(prev => Math.min(prev + 1, thumbnailIds.length - 1));
      }
    },
    onSwipeRight: () => {
      if (currentIndex > 0) {
        setCurrentIndex(prev => Math.max(prev - 1, 0));
      }
    },
    threshold: 50,
    snapThreshold: 0.2
  });

  // Load thumbnails sequentially - prioritize current, then adjacent
  // START LOADING IMMEDIATELY - don't wait for accountId (loadThumbnail fetches it internally)
  useEffect(() => {
    if (thumbnailIds.length === 0) return;

    let cancelled = false;

    // Priority 1: Current thumbnail - START IMMEDIATELY
    if (thumbnailIds[currentIndex]) {
      const token = thumbnailTokens?.[currentIndex];
      loadThumbnail(thumbnailIds[currentIndex], currentIndex, null, token).catch(() => {});
    }
    
    // Priority 2: Next thumbnail (preload)
    if (currentIndex + 1 < thumbnailIds.length) {
      const token = thumbnailTokens?.[currentIndex + 1];
      loadThumbnail(thumbnailIds[currentIndex + 1], currentIndex + 1, null, token).catch(() => {});
    }
    
    // Priority 3: Previous thumbnail (preload)
    if (currentIndex > 0) {
      const token = thumbnailTokens?.[currentIndex - 1];
      loadThumbnail(thumbnailIds[currentIndex - 1], currentIndex - 1, null, token).catch(() => {});
    }
    
    // Priority 4: Load remaining thumbnails in background (non-blocking)
    const remainingIndices = thumbnailIds
      .map((_, index) => index)
      .filter(index => 
        index !== currentIndex && 
        index !== currentIndex + 1 && 
        index !== currentIndex - 1 &&
        !loadedThumbnailsRef.current.has(index) &&
        !loadingThumbnailsRef.current.has(index)
      );
    
    // Load remaining in parallel (non-blocking)
    remainingIndices.forEach(index => {
      if (!cancelled) {
        const token = thumbnailTokens?.[index];
        loadThumbnail(thumbnailIds[index], index, null, token).catch(() => {});
      }
    });

    return () => {
      cancelled = true;
    };
  }, [thumbnailIds, currentIndex, loadThumbnail]);

  // Scroll to current thumbnail
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const thumbnailElement = thumbnailRefs.current.get(currentIndex);
    if (thumbnailElement) {
      thumbnailElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentIndex]);

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [thumbnailUrls]);

  if (thumbnailIds.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="text-white/70">No thumbnails available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-black relative">
      {/* Page indicator */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 bg-black/60 px-4 py-2 rounded-full">
        <span className="text-white text-sm">
          {currentIndex + 1} / {thumbnailIds.length}
        </span>
      </div>

      {/* Horizontal scrollable container - full-screen snap scrolling */}
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
          {thumbnailIds.map((thumbnailId, index) => {
            const thumbnailUrl = thumbnailUrls.get(index);
            const isLoading = loadingThumbnailsRef.current.has(index);
            const hasFailed = failedThumbnailsRef.current.has(index);
            const isCurrent = index === currentIndex;

            return (
              <div
                key={`${thumbnailId}-${index}`}
                ref={(el) => {
                  if (el) thumbnailRefs.current.set(index, el);
                }}
                className="snap-start flex-shrink-0 w-full h-full flex items-center justify-center"
                style={{
                  minWidth: '100%',
                  maxWidth: '100%'
                }}
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={`Page ${index + 1}${fileName ? ` of ${fileName}` : ''}`}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      maxHeight: 'calc(100vh - 64px - env(safe-area-inset-bottom, 0px))'
                    }}
                  />
                ) : hasFailed ? (
                  <div className="text-white/50 text-center">
                    <p className="text-sm">Page {index + 1}</p>
                    <p className="text-xs mt-1 opacity-70">Authentication required</p>
                  </div>
                ) : isLoading ? (
                  <div className="text-white/70 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/50 mx-auto mb-2"></div>
                    <p className="text-xs">Loading...</p>
                  </div>
                ) : (
                  <div className="text-white/50 text-center">
                    <p className="text-xs">Page {index + 1}</p>
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

