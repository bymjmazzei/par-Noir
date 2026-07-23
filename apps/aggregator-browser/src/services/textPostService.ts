/**
 * Text Post Service
 * Handles creation and upload of text-based posts (Thoughts)
 */

import { TextPostData, TextPostStyle } from '../types/aggregator';
import { uploadQueueService } from './uploadQueueService';



/**
 * Convert multiple thought pages to a PDF document
 * @param pages - Array of text post data to render as PDF pages
 * @returns PDF blob
 */
export async function convertThoughtPagesToPDF(pages: TextPostData[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  
  // Render each page to a canvas/image
  const pageImages: string[] = []; // Array of data URLs
  
  for (const page of pages) {
    // Render at full quality (scale 1.0) for PDF
    const imageBlob = await renderTextPostToBlob(page, 1.0);
    // Convert blob to data URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(imageBlob);
    });
    pageImages.push(dataUrl);
  }
  
  // Create PDF - each page is 1080x1080 pixels (square)
  // Convert to mm: 1080px at 96 DPI ≈ 286mm (11.25 inches)
  const PAGE_SIZE_MM = 286;
  const pdf = new jsPDF({
    unit: 'mm',
    format: [PAGE_SIZE_MM, PAGE_SIZE_MM],
    orientation: 'portrait'
  });
  
  // Add first page with first image
  if (pageImages.length > 0) {
    pdf.addImage(pageImages[0], 'PNG', 0, 0, PAGE_SIZE_MM, PAGE_SIZE_MM);
  }
  
  // Add remaining pages
  for (let i = 1; i < pageImages.length; i++) {
    pdf.addPage([PAGE_SIZE_MM, PAGE_SIZE_MM], 'portrait');
    pdf.addImage(pageImages[i], 'PNG', 0, 0, PAGE_SIZE_MM, PAGE_SIZE_MM);
  }
  
  // Return PDF as blob
  return pdf.output('blob');
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
    const backgroundImage = style.backgroundImage;
    await new Promise<void>((resolve) => {
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
      img.src = backgroundImage;
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
  // Calculate the height from first line center to last line center
  const blockHeight = lines.length > 0 ? (lines.length - 1) * lineHeight : 0;
  // Center the text block: first line center at height/2 - half of block height
  const startY = lines.length > 0 ? (height - blockHeight) / 2 : height / 2;

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
): Promise<{ fileId: string; thumbnailFileId?: string; thumbnailShareToken?: any; success: boolean; error?: string; taskId?: string }> {
  // Use upload queue for non-blocking upload
  return new Promise((resolve) => {
    const taskId = uploadQueueService.addTask({
      type: 'textPost',
      textPost,
      accountId,
      metadata: {
        title: metadata?.title,
        description: metadata?.description,
        keywords: metadata?.keywords || [],
        tags: metadata?.tags || [],
        isPublic: metadata?.isPublic || false,
        isNSFW: metadata?.isNSFW || false,
      },
      onComplete: (result) => {
        resolve({
          fileId: result.fileId || '',
          thumbnailFileId: result.thumbnailFileId,
          thumbnailShareToken: result.thumbnailShareToken,
          success: true,
          taskId,
        });
      },
      onError: (error) => {
        resolve({
          fileId: '',
          success: false,
          error: error.message,
          taskId,
        });
      },
    });
  });
}
