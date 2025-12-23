/**
 * Text Post Service
 * Handles creation and upload of text-based posts (Thoughts)
 */

import { TextPostData, TextPostStyle } from '../types/aggregator';
import { PNOAuthService } from './pnOAuthService';
import { EncryptionManager } from '../utils/encryptionManager';
import { getEncryptionService } from './encryptionService';

const apiEndpoint = process.env.REACT_APP_API_ENDPOINT || 'https://api.parnoir.com';

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

/**
 * Render text post to canvas and return as blob
 * @param textPost - The text post data to render
 * @param scale - Optional scale factor (default: 1.0). Use smaller values for thumbnails (e.g., 0.3 for ~300px thumbnails)
 */
export async function renderTextPostToBlob(textPost: TextPostData, scale: number = 1.0): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const width = Math.round(1080 * scale);
  const height = Math.round(1080 * scale); // Square format for better display on all screens
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const style = textPost.style;

  // Fill background
  if (style.backgroundImage) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        drawText(ctx, width, height, textPost.content, style, scale);
        resolve();
      };
      img.onerror = () => {
        // Fallback to solid color
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(0, 0, width, height);
        drawText(ctx, width, height, textPost.content, style, scale);
        resolve();
      };
      img.src = style.backgroundImage;
    });
  } else {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, width, height, textPost.content, style, scale);
  }

  // Convert canvas to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/png');
  });
}

function drawText(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  content: string,
  style: TextPostStyle,
  scale: number = 1.0
) {
  ctx.save();

  // Set font (scaled)
  const scaledFontSize = Math.round(style.fontSize * scale);
  ctx.font = `${scaledFontSize}px ${style.fontFamily}`;
  ctx.fillStyle = style.textColor;

  // Set text alignment
  if (style.textAlign === 'center') {
    ctx.textAlign = 'center';
  } else if (style.textAlign === 'right') {
    ctx.textAlign = 'right';
  } else if (style.textAlign === 'left') {
    ctx.textAlign = 'left';
  } else {
    ctx.textAlign = 'left'; // justify handled separately
  }

  ctx.textBaseline = 'middle';

  // Apply drop shadow (scaled)
  ctx.shadowColor = style.dropShadowColor;
  ctx.shadowBlur = style.dropShadowBlur * scale;
  ctx.shadowOffsetX = style.dropShadowOffsetX * scale;
  ctx.shadowOffsetY = style.dropShadowOffsetY * scale;

  // Word wrap text
  const scaledPadding = style.padding * scale;
  const maxWidth = width - (scaledPadding * 2);
  const lines = wrapText(ctx, content, maxWidth);
  const lineHeight = scaledFontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = (height - totalHeight) / 2;

  lines.forEach((line, index) => {
    const y = startY + (index * lineHeight);
    let x = width / 2; // Default center

    if (style.textAlign === 'left') {
      x = scaledPadding;
    } else if (style.textAlign === 'right') {
      x = width - scaledPadding;
    }

    ctx.fillText(line, x, y);
  });

  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine + ' ' + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Create and upload a text post (Thought)
 */
export async function createTextPost(
  textPost: TextPostData,
  accountId: string,
  metadata?: {
    title?: string;
    description?: string;
    keywords?: string[];
    tags?: string[];
    isPublic?: boolean;
    isNSFW?: boolean;
    isPartOfCollection?: boolean; // If true, thumbnail will be private (only collection shows in feeds)
  }
): Promise<{ fileId: string; thumbnailFileId?: string; thumbnailShareToken?: any; success: boolean; error?: string }> {
  try {
    // Force refresh token to ensure it's fresh for the entire upload process
    const accessToken = await PNOAuthService.getValidAccessToken(true);
    if (!accessToken) {
      throw new Error('No valid access token');
    }

    // Get session for encryption
    const session = PNOAuthService.loadSession();
    if (!session?.did) {
      throw new Error('No DID in session for encryption');
    }

    let publicKey = session?.publicKey;

    // If publicKey is missing, try to refresh it from userinfo
    if (!publicKey && session.accessToken) {
      try {
        const userInfo = await PNOAuthService.getUserInfo(session.accessToken);
        if (userInfo.public_key) {
          publicKey = userInfo.public_key;
          const updatedSession = { ...session, publicKey };
          PNOAuthService.saveSession(updatedSession);
        }
      } catch (err) {
        // Silent fail
      }
    }

    if (!publicKey) {
      throw new Error('No publicKey available for encryption. Please unlock your pN.');
    }

    // Store thought as JSON with raw HTML/CSS data (not PNG)
    // Thoughts are rendered on the client side for display
    const thoughtData = {
      textPost: textPost,
      version: '1.0',
      createdAt: new Date().toISOString()
    };
    
    const fileName = `thought-${Date.now()}.thought`;
    const fileContent = JSON.stringify(thoughtData);
    const file = new File([fileContent], fileName, { type: 'application/json' });

    console.log('📤 [TextPost] Starting upload...', { fileName, fileSize: file.size });

    // Encrypt file
    const fileArrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(fileArrayBuffer);

    const encryptionManager = new EncryptionManager();
    const encrypted = await encryptionManager.encrypt(
      fileData,
      session.did,
      publicKey
    );

    // Create encrypted file package
    const packageData: EncryptedFilePackage = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
      salt: encrypted.salt,
      metadata: {
        originalName: fileName,
        originalSize: file.size,
        originalMimeType: file.type,
      },
    };

    // Generate share token
    let shareToken: any = undefined;
    try {
      const encryptionService = getEncryptionService();
      shareToken = await encryptionService.generateShareToken(
        packageData,
        {
          id: session.did,
          publicKey: publicKey
        }
      );
      console.log('✅ [TextPost] Share token generated successfully');
    } catch (tokenError: any) {
      console.error('❌ [TextPost] Share token generation failed:', tokenError?.message || tokenError);
      shareToken = undefined;
    }

    // Convert to JSON string
    const encryptedBlob = new Blob([JSON.stringify(packageData)], {
      type: 'application/json',
    });

    // Convert encrypted blob to base64
    const base64File = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read encrypted file'));
      reader.readAsDataURL(encryptedBlob);
    });

    // Get fresh access token right before upload to ensure it's valid
    // Force refresh to prevent expiration during long-running multi-page uploads
    const uploadToken = await PNOAuthService.getValidAccessToken(true);
    if (!uploadToken) {
      throw new Error('No valid access token for upload');
    }

    // Upload encrypted file
    const encryptedFileName = `${fileName}.encrypted`;
    const uploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${uploadToken}`
      },
      body: JSON.stringify({
        fileData: base64File,
        fileName: encryptedFileName,
        mimeType: 'application/json',
        accountId: accountId
      })
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text().catch(() => 'Unknown error');
      throw new Error(`Upload failed: ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    const uploadedFile = uploadResult.file;

    if (!uploadedFile || !uploadedFile.id) {
      throw new Error('Upload succeeded but no file ID returned');
    }

    const fileId = uploadedFile.id;
    console.log('✅ [TextPost] File uploaded successfully, fileId:', fileId);

    // Generate and upload thumbnail PNG - thoughts now render as images for instant performance
    console.log('🖼️ [TextPost] Generating thumbnail PNG...');
    let thumbnailFileId: string | undefined = undefined;
    let thumbnailShareToken: any = undefined;
    
    try {
      // Generate full-size PNG thumbnail (1080x1080) - this is what users see in feeds
      const thumbnailBlob = await renderTextPostToBlob(textPost, 1.0);
      
      // Encrypt thumbnail
      const thumbnailArrayBuffer = await thumbnailBlob.arrayBuffer();
      const thumbnailData = new Uint8Array(thumbnailArrayBuffer);
      const encryptedThumbnail = await encryptionManager.encrypt(
        thumbnailData,
        session.did,
        publicKey
      );
      
      // Create encrypted thumbnail package
      const thumbnailPackage: EncryptedFilePackage = {
        encrypted: encryptedThumbnail.encrypted,
        iv: encryptedThumbnail.iv,
        salt: encryptedThumbnail.salt,
        metadata: {
          originalName: `thumb_${fileName.replace('.thought', '.png')}`,
          originalSize: thumbnailBlob.size,
          originalMimeType: 'image/png',
        },
      };
      
      // Generate share token for thumbnail
      try {
        const encryptionService = getEncryptionService();
        thumbnailShareToken = await encryptionService.generateShareToken(
          thumbnailPackage,
          {
            id: session.did,
            publicKey: publicKey
          }
        );
        console.log('✅ [TextPost] Thumbnail share token generated successfully');
      } catch (tokenError: any) {
        console.error('❌ [TextPost] Thumbnail share token generation failed:', tokenError?.message || tokenError);
        thumbnailShareToken = undefined;
      }
      
      // Convert to base64
      const thumbnailBlobJson = new Blob([JSON.stringify(thumbnailPackage)], {
        type: 'application/json',
      });
      
      const thumbnailBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Failed to read thumbnail'));
        reader.readAsDataURL(thumbnailBlobJson);
      });
      
      // Upload encrypted thumbnail
      const thumbnailFileName = `thumb_${fileName.replace('.thought', '.png')}.encrypted`;
      const thumbnailUploadResponse = await fetch(`${apiEndpoint}/api/drive/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${uploadToken}`
        },
        body: JSON.stringify({
          fileData: thumbnailBase64,
          fileName: thumbnailFileName,
          mimeType: 'application/json',
          accountId: accountId
        })
      });
      
      if (thumbnailUploadResponse.ok) {
        const thumbnailResult = await thumbnailUploadResponse.json();
        thumbnailFileId = thumbnailResult.file?.id;
        if (thumbnailFileId) {
          console.log('✅ [TextPost] Thumbnail uploaded successfully, thumbnailFileId:', thumbnailFileId);
        }
      } else {
        const errorText = await thumbnailUploadResponse.text().catch(() => 'Unknown error');
        console.warn('⚠️ [TextPost] Thumbnail upload failed, continuing without thumbnail:', errorText);
      }
    } catch (thumbnailError: any) {
      console.error('❌ [TextPost] Thumbnail generation/upload failed:', thumbnailError);
      // Continue without thumbnail - thought can still work with textPost in metadata
    }

    // Get fresh access token right before metadata update to ensure it's valid
    // Force refresh to prevent expiration during long-running multi-page uploads
    const metadataToken = await PNOAuthService.getValidAccessToken(true);
    if (!metadataToken) {
      throw new Error('No valid access token for metadata update');
    }

    // Extract first line of text for title (like caption)
    const getFirstLine = (text: string): string => {
      // Remove HTML tags if present
      const textWithoutHtml = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
      // Get first line (split by newline or <br>)
      const lines = textWithoutHtml.split(/\n|<br\s*\/?>/i);
      const firstLine = lines[0] || textWithoutHtml;
      // Trim and limit length
      return firstLine.trim().substring(0, 100);
    };

    const titleFromContent = getFirstLine(textPost.content || '');

    // Extract subjects from text post content and metadata
    const { extractSubjects } = await import('../utils/subjectExtractor');
    const subjects = extractSubjects(
      metadata?.description || textPost.content,
      metadata?.tags || [],
      metadata?.keywords || []
    );

    // Create metadata entry with text post data
    // NOTE: Original thought file is PRIVATE (isPublic: false) - only the thumbnail appears in feeds
    // The original file is kept for editing purposes only
    console.log('📝 [TextPost] Creating metadata entry with text post data (private, for editing only)...');
    const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${metadataToken}`
      },
      body: JSON.stringify({
        name: metadata?.title || titleFromContent || 'Thought',
        description: metadata?.description || textPost.content,
        keywords: metadata?.keywords || [],
        tags: metadata?.tags || [],
        fileType: 'thought', // Custom filetype for thoughts (not PNG)
        isPublic: false, // Original thought file is PRIVATE - only thumbnail appears in feeds
        publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
        uploadDate: new Date().toISOString(),
        textPost: textPost, // Include the full text post data (for editing)
        thought: textPost, // Alias for compatibility
        thumbnailFileId: thumbnailFileId, // Reference to PNG thumbnail for rendering
        isNSFW: metadata?.isNSFW || false,
        feedCategories: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords : undefined,
        category: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords[0] : undefined,
        subjects: subjects.length > 0 ? subjects : undefined,
      }),
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text().catch(() => 'Unknown error');
      console.warn('⚠️ [TextPost] Failed to create metadata entry:', errorText);
      // Still return success since file was uploaded
    } else {
      console.log('✅ [TextPost] Metadata entry created successfully');
    }
    
    // If thought is public and we have a thumbnail, submit thumbnail to public index
    // This makes thoughts render instantly in feeds (just like images/videos)
    // For multi-page thoughts (isPartOfCollection), thumbnails are private - only the collection shows
    const isPublic = metadata?.isPublic ?? true;
    const isPartOfCollection = metadata?.isPartOfCollection ?? false;
    const thumbnailIsPublic = isPublic && !isPartOfCollection; // Private if part of collection
    
    if (thumbnailFileId) {
      try {
        const thumbnailPublicToken = thumbnailShareToken ? JSON.stringify(thumbnailShareToken) : undefined;
        
        // Submit thumbnail to metadata index
        // If part of collection, thumbnail is private (only collection shows in feeds)
        const thumbnailMetadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${thumbnailFileId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${metadataToken}`
          },
          body: JSON.stringify({
            name: `thumb_thought-${Date.now()}.png`,
            title: metadata?.title || titleFromContent || 'Thought',
            // No description - thoughts don't show captions by default (can be added later via metadata edit)
            keywords: metadata?.keywords || [],
            tags: metadata?.tags || [],
            // Use different fileType for thumbnails of collection thoughts vs single thoughts
            fileType: isPartOfCollection ? 'thought-collection-thumbnail' : 'image', // Separate type for collection thought thumbnails
            isPublic: thumbnailIsPublic, // Private if part of collection (like PDF page thumbnails)
            uploadDate: new Date().toISOString(),
            isNSFW: metadata?.isNSFW || false,
            // Mark as thought thumbnail so UI knows to render title only (no caption)
            isThoughtThumbnail: true,
            // Mark if part of collection (for filtering)
            isPartOfCollection: isPartOfCollection,
            // Store reference to main file for editing
            mainFileId: fileId, // Reference to JSON file for editing
            publicToken: thumbnailPublicToken,
            feedCategories: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords : undefined,
            category: metadata?.keywords && metadata.keywords.length > 0 ? metadata.keywords[0] : undefined,
            subjects: subjects.length > 0 ? subjects : undefined,
          }),
        });
        
        if (thumbnailMetadataResponse.ok) {
          console.log('✅ [TextPost] Thumbnail submitted to public index');
        } else {
          const errorText = await thumbnailMetadataResponse.text().catch(() => 'Unknown error');
          console.warn('⚠️ [TextPost] Failed to submit thumbnail to public index:', errorText);
        }
      } catch (thumbIndexError: any) {
        console.error('❌ [TextPost] Failed to submit thumbnail to public index:', thumbIndexError);
        // Don't fail the upload if thumbnail indexing fails
      }
    }

    return { fileId, thumbnailFileId, thumbnailShareToken, success: true };
  } catch (error: any) {
    console.error('❌ [TextPost] Failed to create text post:', error);
    return {
      fileId: '',
      thumbnailFileId: undefined,
      thumbnailShareToken: undefined,
      success: false,
      error: error?.message || 'Failed to create text post'
    };
  }
}

