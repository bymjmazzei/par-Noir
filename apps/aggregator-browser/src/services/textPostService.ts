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
 */
export async function renderTextPostToBlob(textPost: TextPostData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const width = 1080;
  const height = 1920;
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
        drawText(ctx, width, height, textPost.content, style);
        resolve();
      };
      img.onerror = () => {
        // Fallback to solid color
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(0, 0, width, height);
        drawText(ctx, width, height, textPost.content, style);
        resolve();
      };
      img.src = style.backgroundImage;
    });
  } else {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, width, height, textPost.content, style);
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
  style: TextPostStyle
) {
  ctx.save();

  // Set font
  ctx.font = `${style.fontSize}px ${style.fontFamily}`;
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

  // Apply drop shadow
  ctx.shadowColor = style.dropShadowColor;
  ctx.shadowBlur = style.dropShadowBlur;
  ctx.shadowOffsetX = style.dropShadowOffsetX;
  ctx.shadowOffsetY = style.dropShadowOffsetY;

  // Word wrap text
  const maxWidth = width - (style.padding * 2);
  const lines = wrapText(ctx, content, maxWidth);
  const lineHeight = style.fontSize * 1.2;
  const totalHeight = lines.length * lineHeight;
  const startY = (height - totalHeight) / 2;

  lines.forEach((line, index) => {
    const y = startY + (index * lineHeight);
    let x = width / 2; // Default center

    if (style.textAlign === 'left') {
      x = style.padding;
    } else if (style.textAlign === 'right') {
      x = width - style.padding;
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
    contentRating?: string;
  }
): Promise<{ fileId: string; success: boolean; error?: string }> {
  try {
    const accessToken = await PNOAuthService.getValidAccessToken();
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

    // Render text post to blob
    console.log('🎨 [TextPost] Rendering text post to image...');
    const imageBlob = await renderTextPostToBlob(textPost);

    // Create file from blob
    const fileName = `thought-${Date.now()}.png`;
    const file = new File([imageBlob], fileName, { type: 'image/png' });

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
    const uploadToken = await PNOAuthService.getValidAccessToken();
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

    // Get fresh access token right before metadata update to ensure it's valid
    const metadataToken = await PNOAuthService.getValidAccessToken();
    if (!metadataToken) {
      throw new Error('No valid access token for metadata update');
    }

    // Create metadata entry with text post data
    console.log('📝 [TextPost] Creating metadata entry with text post data...');
    const metadataResponse = await fetch(`${apiEndpoint}/api/aggregator/metadata-index/${fileId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${metadataToken}`
      },
      body: JSON.stringify({
        name: metadata?.title || textPost.content || 'Thought',
        description: metadata?.description || textPost.content,
        keywords: metadata?.keywords || [],
        tags: metadata?.tags || [],
        fileType: 'text', // Mark as text type
        isPublic: metadata?.isPublic ?? true, // Thoughts are public by default
        publicToken: shareToken ? JSON.stringify(shareToken) : undefined,
        uploadDate: new Date().toISOString(),
        textPost: textPost, // Include the full text post data
        thought: textPost, // Alias for compatibility
        contentRating: metadata?.contentRating,
      }),
    });

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text().catch(() => 'Unknown error');
      console.warn('⚠️ [TextPost] Failed to create metadata entry:', errorText);
      // Still return success since file was uploaded
    } else {
      console.log('✅ [TextPost] Metadata entry created successfully');
    }

    return { fileId, success: true };
  } catch (error: any) {
    console.error('❌ [TextPost] Failed to create text post:', error);
    return {
      fileId: '',
      success: false,
      error: error?.message || 'Failed to create text post'
    };
  }
}

