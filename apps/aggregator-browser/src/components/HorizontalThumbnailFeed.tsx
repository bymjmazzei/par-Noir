/**
 * Horizontal Thumbnail Feed Component
 * Displays thumbnails in a horizontal scrollable list (like vertical feed but horizontal)
 * Shows multiple thumbnails side-by-side, loads progressively
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface HorizontalThumbnailFeedProps {
  thumbnailIds: string[]; // Array of thumbnail file IDs
  fileName?: string;
  accountId?: string; // Account ID for downloading images
  pdfFileId?: string; // PDF file ID (optional, for future use)
  onThumbnailClick?: (index: number, thumbnailId: string) => void; // Optional: handle thumbnail clicks
}

export function HorizontalThumbnailFeed({ 
  thumbnailIds, 
  fileName, 
  accountId,
  pdfFileId,
  onThumbnailClick 
}: HorizontalThumbnailFeedProps) {
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<number, string>>(new Map());
  const loadedThumbnailsRef = useRef<Set<number>>(new Set());
  const loadingThumbnailsRef = useRef<Set<number>>(new Set());
  const failedThumbnailsRef = useRef<Set<number>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
    accountIdHint: string | null
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
      
      // Handle encrypted files (same pattern as FullScreenFeed)
      if (contentType.includes('application/json')) {
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);

          if (parsed.encrypted && parsed.iv && parsed.salt &&
              typeof parsed.encrypted === 'string' &&
              typeof parsed.iv === 'string' &&
              typeof parsed.salt === 'string') {
            // Encrypted file - decrypt
            const { EncryptionManager } = await import('../utils/encryptionManager');
            const session = PNOAuthService.loadSession();
            if (!session?.did) {
              console.warn(`[HorizontalThumbnailFeed] Cannot decrypt - no session`);
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
  }, [accountId]);

  // Load all thumbnails in parallel immediately
  useEffect(() => {
    if (thumbnailIds.length === 0) return;

    let cancelled = false;

    const loadPromises = thumbnailIds.map(async (thumbnailId, index) => {
      if (cancelled) return;
      const accountIdHint = await fetchAccountIdOnce();
      await loadThumbnail(thumbnailId, index, accountIdHint);
    });

    Promise.all(loadPromises).catch(() => {
      // Errors handled in loadThumbnail
    });

    return () => {
      cancelled = true;
    };
  }, [thumbnailIds, fetchAccountIdOnce, loadThumbnail]);

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
    <div className="w-full h-full flex flex-col bg-black">
      {/* Horizontal scrollable container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-hidden"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="flex h-full gap-2 p-2">
          {thumbnailIds.map((thumbnailId, index) => {
            const thumbnailUrl = thumbnailUrls.get(index);
            const isLoading = loadingThumbnailsRef.current.has(index);
            const hasFailed = failedThumbnailsRef.current.has(index);

            return (
              <div
                key={`${thumbnailId}-${index}`}
                className="flex-shrink-0 h-full relative group cursor-pointer"
                style={{
                  minWidth: '200px',
                  maxWidth: '300px',
                  width: '30vw'
                }}
                onClick={() => onThumbnailClick?.(index, thumbnailId)}
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt={`Page ${index + 1}${fileName ? ` of ${fileName}` : ''}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : hasFailed ? (
                  <div className="w-full h-full bg-neutral-800 rounded-lg flex items-center justify-center text-white/50 text-sm">
                    <p>Page {index + 1}</p>
                  </div>
                ) : isLoading ? (
                  <div className="w-full h-full bg-neutral-800 rounded-lg flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/50"></div>
                  </div>
                ) : (
                  <div className="w-full h-full bg-neutral-800 rounded-lg flex items-center justify-center text-white/40 text-sm">
                    <p>Page {index + 1}</p>
                  </div>
                )}
                
                {/* Page number overlay */}
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  {index + 1} / {thumbnailIds.length}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

