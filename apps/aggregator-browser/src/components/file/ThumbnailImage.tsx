/**
 * Thumbnail component that handles authenticated loading, decryption, and thought rendering.
 * Extracted from FileStorageAggregator.
 */

import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { PNOAuthService } from '../../services/pnOAuthService';
import { EncryptionManager } from '../../utils/encryptionManager';
import { API_ENDPOINT } from '../../config/api';
import { fetchStorageFile } from '../../services/storageApiClient';
import { getOwnerApiHeaders } from '../../services/ownerApiHeaders';

interface EncryptedFilePackage {
  encrypted: string;
  iv: string;
  salt: string;
  metadata: {
    originalName?: string;
    originalSize?: number;
    originalMimeType?: string;
  };
}

async function createThumbnailFromBlob(blob: Blob, maxWidth: number, maxHeight: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((thumbnailBlob) => {
        if (thumbnailBlob) resolve(thumbnailBlob);
        else reject(new Error('Failed to create thumbnail blob'));
      }, 'image/jpeg', 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for thumbnail'));
    };
    img.src = url;
  });
}

export interface ThumbnailImageProps {
  fileId: string;
  accountId: string;
  fileName: string;
  alt: string;
  className?: string;
  mimeType?: string;
  mainFileId?: string;
  isThumbnail?: boolean;
  isEncrypted?: boolean; // When true, main file is encrypted; prefer over fileName.endsWith('.encrypted')
  backend?: string;
}

export const ThumbnailImage: React.FC<ThumbnailImageProps> = ({
  fileId,
  accountId,
  fileName,
  alt,
  className = 'w-full h-full object-cover',
  mainFileId,
  isThumbnail,
  isEncrypted: isEncryptedProp,
  backend = 'google_drive',
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const isEncrypted = isEncryptedProp !== undefined ? isEncryptedProp : fileName.toLowerCase().endsWith('.encrypted');

  useEffect(() => {
    let blobUrl: string | null = null;

    const loadThumbnail = async () => {
      try {
        if (fileId.startsWith('uploading_')) {
          setError(false);
          return;
        }
        const accessToken = await PNOAuthService.getValidAccessToken();
        if (!accessToken) {
          setError(true);
          return;
        }
        const session = PNOAuthService.loadSession();
        const pnIdentifier = session?.pnIdentifier;
        if (!pnIdentifier) {
          setError(true);
          return;
        }

        const fileNameWithoutEncrypted = fileName.replace(/\.encrypted$/i, '');
        const isThoughtFile =
          fileNameWithoutEncrypted.toLowerCase().startsWith('thought-') &&
          (fileNameWithoutEncrypted.toLowerCase().endsWith('.thought') || fileNameWithoutEncrypted.toLowerCase().endsWith('.png'));
        const isThoughtThumbnail =
          fileNameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-') &&
          (fileNameWithoutEncrypted.toLowerCase().endsWith('.thought') || fileNameWithoutEncrypted.toLowerCase().endsWith('.png'));
        const isThought = isThoughtFile || isThoughtThumbnail;

        // Thought thumbnails are encrypted PNGs on Drive — load thumb fileId, not private main .thought
        if (isThoughtThumbnail) {
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            setError(true);
            return;
          }
          let publicKey = session?.publicKey;
          if (!publicKey && session.did.startsWith('did:key:')) publicKey = session.did.substring(8);
          if (!publicKey) {
            setError(true);
            return;
          }
          try {
            let response = await fetchStorageFile(accessToken, pnIdentifier, backend, fileId, {
              accountId,
              thumbnail: true
            });
            if (!response.ok) {
              response = await fetchStorageFile(accessToken, pnIdentifier, backend, fileId, {
                accountId
              });
            }
            if (!response.ok) {
              setError(true);
              return;
            }
            const contentType = response.headers.get('content-type') || '';
            const blob = await response.blob();
            if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
              const encryptedText = await blob.text();
              const encryptedPackage = JSON.parse(encryptedText);
              const encryptionManager = new EncryptionManager();
              const decryptedData = await encryptionManager.decrypt(
                encryptedPackage.encrypted,
                encryptedPackage.iv,
                encryptedPackage.salt,
                session.did,
                publicKey
              );
              const decryptedBlob = new Blob([decryptedData as BlobPart], {
                type: encryptedPackage.metadata?.originalMimeType || 'image/png',
              });
              blobUrl = URL.createObjectURL(await createThumbnailFromBlob(decryptedBlob, 300, 300));
            } else {
              blobUrl = URL.createObjectURL(blob);
            }
            setThumbnailUrl(blobUrl);
            setError(false);
            return;
          } catch {
            setError(true);
            return;
          }
        }

        if (isThought && !isThoughtThumbnail && isEncrypted && !isThumbnail) {
          try {
            const metadataResponse = await fetch(`${API_ENDPOINT}/api/aggregator/metadata-index/${fileId}`, {
              headers: getOwnerApiHeaders(),
            });
            if (metadataResponse.ok) {
              const metadata = await metadataResponse.json();
              const thumbnailFileId = metadata.metadata?.thumbnailFileId || metadata.thumbnailFileId;
              if (thumbnailFileId) {
                const thumbResponse = await fetchStorageFile(
                  accessToken,
                  pnIdentifier,
                  backend,
                  thumbnailFileId,
                  { accountId, thumbnail: true }
                );
                if (thumbResponse.ok) {
                  const contentType = thumbResponse.headers.get('content-type') || '';
                  const blob = await thumbResponse.blob();
                  if (contentType.includes('application/json') || contentType.includes('application/octet-stream')) {
                    const session = PNOAuthService.loadSession();
                    if (session?.did) {
                      let publicKey = session?.publicKey;
                      if (!publicKey && session.did.startsWith('did:key:')) publicKey = session.did.substring(8);
                      if (publicKey) {
                        const encryptedText = await blob.text();
                        const encPkg = JSON.parse(encryptedText);
                        const em = new EncryptionManager();
                        const dec = await em.decrypt(encPkg.encrypted, encPkg.iv, encPkg.salt, session.did, publicKey);
                        const db = new Blob([dec as BlobPart], { type: encPkg.metadata?.originalMimeType || 'image/jpeg' });
                        setThumbnailUrl(URL.createObjectURL(db));
                        setError(false);
                        return;
                      }
                    }
                  } else {
                    setThumbnailUrl(URL.createObjectURL(blob));
                    setError(false);
                    return;
                  }
                }
              }
            }
          } catch {
            /* fall through */
          }
        }

        if (isEncrypted && !isThoughtFile && !isThoughtThumbnail) {
          const session = PNOAuthService.loadSession();
          if (!session?.did) {
            setError(true);
            return;
          }
          let publicKey = session?.publicKey;
          if (!publicKey && session.accessToken) {
            try {
              const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
              if (userInfo.public_key) {
                publicKey = userInfo.public_key;
                PNOAuthService.saveSession({ ...session, publicKey });
              }
            } catch {
              /* silent */
            }
          }
          if (!publicKey && session.did.startsWith('did:key:')) publicKey = session.did.substring(8);
          if (!publicKey) {
            setError(true);
            return;
          }
          const response = await fetchStorageFile(accessToken, pnIdentifier, backend, fileId, {
            accountId
          });
          if (!response.ok) throw new Error(`Failed to download file: ${response.status}`);
          const encryptedText = await response.text();
          let encryptedPackage: EncryptedFilePackage;
          try {
            encryptedPackage = JSON.parse(encryptedText);
          } catch {
            throw new Error('File is not a valid encrypted package');
          }
          const encryptionManager = new EncryptionManager();
          const decryptedData = await encryptionManager.decrypt(
            encryptedPackage.encrypted,
            encryptedPackage.iv,
            encryptedPackage.salt,
            session.did,
            publicKey
          );
          const decryptedBlob = new Blob([decryptedData as BlobPart], {
            type: encryptedPackage.metadata?.originalMimeType || 'image/jpeg',
          });
          const originalName = encryptedPackage.metadata?.originalName?.toLowerCase() || '';
          const isThoughtFileCheck =
            (originalName.startsWith('thought-') && (originalName.endsWith('.thought') || originalName.endsWith('.png'))) ||
            fileNameWithoutEncrypted.toLowerCase().startsWith('thought-') ||
            fileNameWithoutEncrypted.toLowerCase().startsWith('thumb_thought-');
          if (isThoughtFileCheck) {
            setError(true);
            return;
          }
          try {
            blobUrl = URL.createObjectURL(await createThumbnailFromBlob(decryptedBlob, 300, 300));
            setThumbnailUrl(blobUrl);
            setError(false);
          } catch {
            try {
              blobUrl = URL.createObjectURL(decryptedBlob);
              setThumbnailUrl(blobUrl);
              setError(false);
            } catch {
              setError(true);
            }
          }
        } else {
          let response = await fetchStorageFile(accessToken, pnIdentifier, backend, fileId, {
            accountId,
            thumbnail: true
          });
          if (response.ok) {
            const blob = await response.blob();
            blobUrl = URL.createObjectURL(blob);
            setThumbnailUrl(blobUrl);
            setError(false);
          } else {
            response = await fetchStorageFile(accessToken, pnIdentifier, backend, fileId, {
              accountId
            });
            if (response.ok) {
              const fileBlob = await response.blob();
              const mt = fileBlob.type || '';
              if (mt.startsWith('image/') || mt.startsWith('video/')) {
                try {
                  blobUrl = URL.createObjectURL(await createThumbnailFromBlob(fileBlob, 300, 300));
                  setThumbnailUrl(blobUrl);
                  setError(false);
                } catch {
                  try {
                    blobUrl = URL.createObjectURL(fileBlob);
                    setThumbnailUrl(blobUrl);
                    setError(false);
                  } catch {
                    setError(true);
                  }
                }
              } else setError(true);
            } else setError(true);
          }
        }
      } catch {
        setError(true);
      }
    };
    loadThumbnail();
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      setThumbnailUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [fileId, accountId, isEncrypted, fileName, mainFileId, isThumbnail]);

  if (error || !thumbnailUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Lock className="h-8 w-8 text-blue-400" />
      </div>
    );
  }
  return <img src={thumbnailUrl} alt={alt} className={className} onError={() => setError(true)} />;
};
