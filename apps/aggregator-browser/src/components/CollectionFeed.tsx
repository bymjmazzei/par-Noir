/**
 * Collection Feed Component
 * Displays a collection of mixed file types (images, videos, thoughts) in a slideshow
 * Swipe up/down to navigate between items
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useVerticalSwipe } from '../hooks/useVerticalSwipe';
import { PNOAuthService } from '../services/pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { decryptWithToken, ShareToken } from '../utils/tokenDecryption';
import { useViewportHeightCSS } from '../hooks/useViewportHeight';
import { calculateMediaScaling, getContainerDimensions, type MediaDimensions } from '../utils/mediaScaling';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

interface CollectionFeedProps {
  collectionFileIds: string[];
  accountId?: string;
  onClose?: () => void;
}

interface FileContent {
  type: 'thought' | 'image' | 'video';
  data: any; // URL for image/video, textPost data for thought
}

export function CollectionFeed({ 
  collectionFileIds, 
  accountId,
  onClose: _onClose 
}: CollectionFeedProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fileMetadata, setFileMetadata] = useState<Map<string, any>>(new Map());
  const [fileContent, setFileContent] = useState<Map<string, FileContent>>(new Map());
  const [loading, setLoading] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<Map<string, string>>(new Map());
  const [mediaDimensions, setMediaDimensions] = useState<Map<string, MediaDimensions>>(new Map());
  // Thought thumbnails are stored directly in content.data, no need for separate state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const loadedFilesRef = useRef<Set<string>>(new Set());
  const loadingFilesRef = useRef<Set<string>>(new Set());

  const viewportHeightCSS = useViewportHeightCSS(true);

  // Load metadata for all files in collection
  useEffect(() => {
    const loadMetadata = async () => {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) return;

      for (const fileId of collectionFileIds) {
        if (fileMetadata.has(fileId)) continue;
        
        try {
          const response = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            setFileMetadata(prev => {
              const newMap = new Map(prev);
              newMap.set(fileId, data.metadata || data);
              return newMap;
            });
          }
        } catch (err) {
          console.error(`Failed to load metadata for ${fileId}:`, err);
        }
      }
    };

    loadMetadata();
  }, [collectionFileIds, fileMetadata]);

  // Get accountId helper
  const getAccountId = useCallback(async (): Promise<string | null> => {
    if (accountId && accountId.includes('::')) {
      return accountId;
    }
    
    try {
      const session = PNOAuthService.loadSession();
      if (session?.did || session?.pnIdentifier) {
        const userId = session.pnIdentifier || session.did;
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) return null;
        
        const accountsResponse = await fetch(`${apiEndpoint}/api/storage/accounts/${userId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
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
  }, [accountId]);

  // Load file content
  const loadFileContent = useCallback(async (fileId: string, metadata: any) => {
    if (loadedFilesRef.current.has(fileId) || loadingFilesRef.current.has(fileId)) return;
    
    loadingFilesRef.current.add(fileId);
    setLoading(prev => {
      const newMap = new Map(prev);
      newMap.set(fileId, true);
      return newMap;
    });

    try {
      const accessToken = await PNOAuthService.getValidAccessToken();
      if (!accessToken) {
        throw new Error('No access token');
      }

      const accountIdToUse = await getAccountId();

      // Detect file type
      const fileType = metadata.fileType;
      const fileName = metadata.name || metadata.title || '';
      const hasTextPost = !!(metadata.textPost || metadata.thought);
      const isThought = fileType === 'thought' || fileType === 'text' || hasTextPost;
      const isImage = !isThought && (fileType === 'image' || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|heic|heif)$/i.test(fileName));
      const isVideo = !isThought && (fileType === 'video' || /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i.test(fileName));

      let content: FileContent | null = null;

      if (isThought) {
        // For thoughts, try to load thumbnail first (thoughts should render as images)
        const thumbnailFileId = metadata.thumbnailFileId;
        if (thumbnailFileId) {
          // Load thought thumbnail as image
          let thumbnailUrl = `${apiEndpoint}/api/drive/files/${thumbnailFileId}?thumbnail=true`;
          if (accountIdToUse) {
            thumbnailUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
          }
          
          try {
            const thumbnailResponse = await fetch(thumbnailUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            
            if (thumbnailResponse.ok) {
              const thumbnailBlob = await thumbnailResponse.blob();
              const contentType = thumbnailResponse.headers.get('content-type') || '';
              
              if (contentType.includes('application/json')) {
                // Decrypt thumbnail
                const encryptedText = await thumbnailBlob.text();
                const encryptedPackage = JSON.parse(encryptedText);
                const session = PNOAuthService.loadSession();
                if (session?.did) {
                  const pnId = session.did;
                  let publicKey = session.publicKey;
                  if (!publicKey && session.did.startsWith('did:key:')) {
                    publicKey = session.did.substring(8);
                  }
                  if (publicKey) {
                    const encryptionManager = new EncryptionManager();
                    const decryptedData = await encryptionManager.decrypt(
                      encryptedPackage.encrypted,
                      encryptedPackage.iv,
                      encryptedPackage.salt,
                      pnId,
                      publicKey
                    );
                    const arrayBuffer = decryptedData.buffer.slice(
                      decryptedData.byteOffset,
                      decryptedData.byteOffset + decryptedData.byteLength
                    ) as ArrayBuffer;
                    const imageBlob = new Blob([arrayBuffer], {
                      type: encryptedPackage.metadata.originalMimeType || 'image/png'
                    });
                    const thumbnailUrlObj = URL.createObjectURL(imageBlob);
                    content = {
                      type: 'image', // Treat thought thumbnail as image
                      data: thumbnailUrlObj
                    };
                  }
                }
              } else {
                // Not encrypted, use directly
                const thumbnailUrlObj = URL.createObjectURL(thumbnailBlob);
                content = {
                  type: 'image', // Treat thought thumbnail as image
                  data: thumbnailUrlObj
                };
              }
            }
          } catch (thumbnailErr) {
            console.warn(`Failed to load thought thumbnail for ${fileId}, falling back to text rendering:`, thumbnailErr);
          }
        }
        
        // Fallback: Load and decrypt thought text if thumbnail not available
        if (!content) {
          const publicToken = metadata.publicToken;
          if (publicToken) {
            try {
              const token: ShareToken = typeof publicToken === 'string' ? JSON.parse(publicToken) : publicToken;
              const decryptedBlob = await decryptWithToken(token);
              const text = await decryptedBlob.text();
              const thoughtData = JSON.parse(text);
              content = {
                type: 'thought',
                data: thoughtData.textPost || thoughtData.thought || thoughtData
              };
            } catch (err) {
              console.error('Failed to decrypt thought:', err);
              setError(prev => {
                const newMap = new Map(prev);
                newMap.set(fileId, 'Failed to load thought');
                return newMap;
              });
            }
          }
        }
      } else if (isImage) {
        // Load image
        let imageUrl = `${apiEndpoint}/api/drive/files/${fileId}?thumbnail=true`;
        if (accountIdToUse) {
          imageUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
        }
        
        const response = await fetch(imageUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('application/json')) {
            // Decrypt image
            const encryptedText = await blob.text();
            const encryptedPackage = JSON.parse(encryptedText);
            const session = PNOAuthService.loadSession();
            if (session?.did) {
              const pnId = session.did;
              let publicKey = session.publicKey;
              if (!publicKey && session.did.startsWith('did:key:')) {
                publicKey = session.did.substring(8);
              }
              if (publicKey) {
                const encryptionManager = new EncryptionManager();
                const decryptedData = await encryptionManager.decrypt(
                  encryptedPackage.encrypted,
                  encryptedPackage.iv,
                  encryptedPackage.salt,
                  pnId,
                  publicKey
                );
                const arrayBuffer = decryptedData.buffer.slice(
                  decryptedData.byteOffset,
                  decryptedData.byteOffset + decryptedData.byteLength
                ) as ArrayBuffer;
                const imageBlob = new Blob([arrayBuffer], {
                  type: encryptedPackage.metadata.originalMimeType || 'image/jpeg'
                });
                content = {
                  type: 'image',
                  data: URL.createObjectURL(imageBlob)
                };
              }
            }
          } else {
            content = {
              type: 'image',
              data: URL.createObjectURL(blob)
            };
          }
        }
      } else if (isVideo) {
        // Load video
        let videoUrl = `${apiEndpoint}/api/drive/files/${fileId}?download=true`;
        if (accountIdToUse) {
          videoUrl += `&accountId=${encodeURIComponent(accountIdToUse)}`;
        }
        
        const response = await fetch(videoUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('application/json')) {
            // Decrypt video
            const encryptedText = await blob.text();
            const encryptedPackage = JSON.parse(encryptedText);
            const session = PNOAuthService.loadSession();
            if (session?.did) {
              const pnId = session.did;
              let publicKey = session.publicKey;
              if (!publicKey && session.did.startsWith('did:key:')) {
                publicKey = session.did.substring(8);
              }
              if (publicKey) {
                const encryptionManager = new EncryptionManager();
                const decryptedData = await encryptionManager.decrypt(
                  encryptedPackage.encrypted,
                  encryptedPackage.iv,
                  encryptedPackage.salt,
                  pnId,
                  publicKey
                );
                const arrayBuffer = decryptedData.buffer.slice(
                  decryptedData.byteOffset,
                  decryptedData.byteOffset + decryptedData.byteLength
                ) as ArrayBuffer;
                const videoBlob = new Blob([arrayBuffer], {
                  type: encryptedPackage.metadata.originalMimeType || 'video/mp4'
                });
                content = {
                  type: 'video',
                  data: URL.createObjectURL(videoBlob)
                };
              }
            }
          } else {
            content = {
              type: 'video',
              data: URL.createObjectURL(blob)
            };
          }
        }
      }

      if (content) {
        setFileContent(prev => {
          const newMap = new Map(prev);
          newMap.set(fileId, content!);
          return newMap;
        });
        loadedFilesRef.current.add(fileId);
      }
    } catch (err: any) {
      console.error(`Failed to load content for ${fileId}:`, err);
      setError(prev => {
        const newMap = new Map(prev);
        newMap.set(fileId, err.message || 'Failed to load');
        return newMap;
      });
    } finally {
      loadingFilesRef.current.delete(fileId);
      setLoading(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });
    }
  }, [getAccountId]);

  // Load content for visible files (current + adjacent)
  useEffect(() => {
    const indicesToLoad = [
      currentIndex - 1,
      currentIndex,
      currentIndex + 1
    ].filter(idx => idx >= 0 && idx < collectionFileIds.length);

    indicesToLoad.forEach(idx => {
      const fileId = collectionFileIds[idx];
      const metadata = fileMetadata.get(fileId);
      if (metadata && !fileContent.has(fileId) && !loading.has(fileId)) {
        loadFileContent(fileId, metadata);
      }
    });
  }, [currentIndex, collectionFileIds, fileMetadata, fileContent, loading, loadFileContent]);

  // Auto-play video when it becomes visible
  useEffect(() => {
    const fileId = collectionFileIds[currentIndex];
    if (!fileId) return;

    const content = fileContent.get(fileId);
    if (content?.type === 'video') {
      const videoElement = videoRefs.current.get(fileId);
      if (videoElement) {
        videoElement.play().catch(err => {
          console.warn('Failed to auto-play video:', err);
        });
      }
    }
  }, [currentIndex, collectionFileIds, fileContent]);

  // Render individual file based on type
  const renderFile = (fileId: string, index: number) => {
    const metadata = fileMetadata.get(fileId);
    const content = fileContent.get(fileId);
    const isLoading = loading.has(fileId);
    const hasError = error.has(fileId);

    if (!metadata) {
      return (
        <div key={fileId} className="w-full h-full flex items-center justify-center">
          <div className="text-white/50">Loading metadata...</div>
        </div>
      );
    }

    if (isLoading) {
      return (
        <div key={fileId} className="w-full h-full flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white/50"></div>
        </div>
      );
    }

    if (hasError) {
      return (
        <div key={fileId} className="w-full h-full flex items-center justify-center">
          <div className="text-white/50 text-center">
            <p className="text-sm">Failed to load</p>
            <p className="text-xs mt-1 opacity-70">{error.get(fileId)}</p>
          </div>
        </div>
      );
    }

    if (!content) {
      return (
        <div key={fileId} className="w-full h-full flex items-center justify-center">
          <div className="text-white/50">No content available</div>
        </div>
      );
    }

    // Render based on content type
    if (content.type === 'thought') {
      const textPost = content.data;
      const style = textPost.style || {};
      // Thoughts are square (1080x1080) - calculate scale for text rendering (based on container)
      const containerDims = getContainerDimensions(64);
      const REFERENCE_WIDTH = 1080;
      const REFERENCE_HEIGHT = 1080;
      const viewportWidth = containerDims.width;
      const viewportHeight = containerDims.height;
      const widthScale = viewportWidth / REFERENCE_WIDTH;
      const heightScale = viewportHeight / REFERENCE_HEIGHT;
      const scale = Math.min(widthScale, heightScale);

      const baseFontSize = style.fontSize || 48;
      const scaledFontSize = baseFontSize * scale;
      const basePadding = style.padding || 40;
      const scaledPadding = basePadding * scale;
      const baseShadowOffsetX = style.dropShadowOffsetX || 2;
      const baseShadowOffsetY = style.dropShadowOffsetY || 2;
      const baseShadowBlur = style.dropShadowBlur || 10;

      return (
        <div
          key={fileId}
          className="w-full h-full flex items-center justify-center relative"
          style={{
            backgroundColor: style.backgroundColor || '#000000',
            backgroundImage: style.backgroundImage ? `url(${style.backgroundImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            overflow: 'hidden', // Prevent overflow
            height: '100%',
            width: '100%'
          }}
        >
          <div
            className="text-center relative z-10"
            style={{
              fontFamily: style.fontFamily || 'Arial',
              fontSize: `${scaledFontSize}px`,
              color: style.textColor || '#FFFFFF',
              fontWeight: style.textStyle === 'bold' ? 'bold' : 'normal',
              fontStyle: style.textStyle === 'italic' ? 'italic' : 'normal',
              textDecoration: style.textStyle === 'strikethrough' ? 'line-through' : 'none',
              textAlign: (style.textAlign || 'center') as 'left' | 'center' | 'right' | 'justify',
              textShadow: `
                ${baseShadowOffsetX * scale}px 
                ${baseShadowOffsetY * scale}px 
                ${baseShadowBlur * scale}px 
                ${style.dropShadowColor || '#000000'}
              `,
              padding: `${scaledPadding}px`,
              maxWidth: `${REFERENCE_WIDTH * scale}px`,
              maxHeight: `${REFERENCE_HEIGHT * scale}px`,
              width: '100%',
              lineHeight: 1.2,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-wrap'
            }}
          >
            {textPost.content}
          </div>
        </div>
      );
    } else if (content.type === 'image') {
      const containerDims = getContainerDimensions(64);
      const dims = mediaDimensions.get(fileId);
      const scalingStyles = calculateMediaScaling(dims, containerDims);
      
      return (
        <div 
          key={fileId} 
          className="w-full h-full flex items-center justify-center relative"
          style={{
            overflow: 'hidden', // Prevent any content from overflowing
            height: '100%',
            width: '100%'
          }}
        >
          {/* Blurred background image - constrained to prevent overflow */}
          <div
            className="absolute inset-0"
            style={{
              width: '100%',
              height: '100%',
              zIndex: 0,
              overflow: 'hidden',
              clipPath: 'inset(0)'
            }}
          >
            <img
              src={content.data}
              alt=""
              className="absolute"
              style={scalingStyles.background}
              loading="eager"
              decoding="async"
              onError={(e) => {
                console.error(`[CollectionFeed] Background image failed to load for ${fileId}:`, e);
              }}
            />
          </div>
          {/* Main image container */}
          <div 
            className="w-full h-full flex items-center justify-center relative z-10"
            style={{
              overflow: 'hidden', // Prevent content overflow
              height: '100%',
              width: '100%'
            }}
          >
            <img
              src={content.data}
              alt={`Collection item ${index + 1}`}
              style={scalingStyles.mainMedia}
              onLoad={(e) => {
                const img = e.currentTarget;
                const naturalWidth = img.naturalWidth;
                const naturalHeight = img.naturalHeight;
                // Track dimensions for this specific image
                setMediaDimensions(prev => {
                  const newMap = new Map(prev);
                  newMap.set(fileId, { width: naturalWidth, height: naturalHeight });
                  return newMap;
                });
              }}
              onError={(e) => {
                console.error(`[CollectionFeed] Image failed to load for ${fileId}:`, e);
              }}
              loading="eager"
              decoding="sync"
            />
          </div>
        </div>
      );
    } else if (content.type === 'video') {
      return (
        <div key={fileId} className="w-full h-full flex items-center justify-center">
          <video
            ref={(el) => {
              if (el) videoRefs.current.set(fileId, el);
            }}
            src={content.data}
            controls
            autoPlay={index === currentIndex}
            className="max-w-full max-h-full"
            style={{
              maxHeight: viewportHeightCSS
            }}
          />
        </div>
      );
    }

    return null;
  };

  // Swipe handling
  const verticalSwipeRef = useVerticalSwipe({
    onSwipeUp: () => {
      if (currentIndex < collectionFileIds.length - 1) {
        setCurrentIndex(prev => prev + 1);
      }
    },
    onSwipeDown: () => {
      if (currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    },
    enabled: true,
    threshold: 50
  });

  // Scroll to current index - use scrollTo with auto behavior for instant snap
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetElement = scrollContainerRef.current.children[currentIndex] as HTMLElement;
      if (targetElement) {
        // Use scrollTo with 'auto' for instant positioning - CSS scroll-snap will handle snapping
        const container = scrollContainerRef.current;
        const targetTop = targetElement.offsetTop;
        container.scrollTo({ top: targetTop, behavior: 'auto' });
      }
    }
  }, [currentIndex]);

  return (
    <div
      ref={(el) => {
        scrollContainerRef.current = el;
        if (verticalSwipeRef.current !== el && el) {
          // @ts-ignore - useVerticalSwipe returns RefObject but hook expects us to set it
          verticalSwipeRef.current = el;
        }
      }}
      className="w-full overflow-y-scroll snap-y snap-mandatory bg-black"
      style={{ 
        scrollbarWidth: 'none', 
        msOverflowStyle: 'none', 
        WebkitOverflowScrolling: 'touch',
        scrollBehavior: 'auto',
        scrollSnapType: 'y mandatory',
        height: viewportHeightCSS,
        maxHeight: viewportHeightCSS,
        minHeight: viewportHeightCSS,
        overflowX: 'hidden',
        overflowY: 'scroll',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        margin: 0,
        padding: 0,
        boxSizing: 'border-box',
        width: '100%'
      }}
    >
      {collectionFileIds.map((fileId, index) => (
        <div
          key={fileId}
          className="w-full snap-start flex items-center justify-center"
          style={{ 
            height: viewportHeightCSS,
            minHeight: viewportHeightCSS,
            maxHeight: viewportHeightCSS,
            flexShrink: 0, // Prevent items from shrinking
            overflow: 'hidden', // Prevent any content overflow
            width: '100%',
            boxSizing: 'border-box',
            margin: 0,
            padding: 0
          }}
        >
          {renderFile(fileId, index)}
        </div>
      ))}
    </div>
  );
}

