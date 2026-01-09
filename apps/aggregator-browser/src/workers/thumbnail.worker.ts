/**
 * Thumbnail Worker - Handles thumbnail generation off main thread
 * Uses OffscreenCanvas for canvas operations in worker context
 */

// Inline types (workers can't import from src)
interface TextPostStyle {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  textStyle?: 'plain' | 'bold' | 'italic' | 'strikethrough';
  dropShadowColor: string;
  dropShadowBlur: number;
  dropShadowOffsetX: number;
  dropShadowOffsetY: number;
  backgroundColor: string;
  backgroundImage?: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  padding: number;
}

interface TextPostData {
  content: string;
  style: TextPostStyle;
  isNSFW?: boolean;
  category?: string;
}

interface RenderTextPostRequest {
  id: string;
  type: 'renderTextPost';
  textPost: TextPostData;
  scale: number;
}

interface CreateImageThumbnailRequest {
  id: string;
  type: 'createImageThumbnail';
  imageData: ArrayBuffer;
  maxWidth: number;
  maxHeight: number;
}

interface CreateVideoThumbnailRequest {
  id: string;
  type: 'createVideoThumbnail';
  videoData: ArrayBuffer;
  maxWidth: number;
  maxHeight: number;
}

type WorkerRequest = RenderTextPostRequest | CreateImageThumbnailRequest | CreateVideoThumbnailRequest;

interface WorkerResponse {
  id: string;
  success: boolean;
  result?: ArrayBuffer; // PNG/JPEG image data
  error?: string;
}

// Helper function to wrap text
function wrapText(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

  return lines;
}

function drawText(
  ctx: OffscreenCanvasRenderingContext2D,
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
    ctx.textAlign = 'left';
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
  const blockHeight = lines.length > 0 ? (lines.length - 1) * lineHeight : 0;
  const startY = lines.length > 0 ? (height - blockHeight) / 2 : height / 2;

  lines.forEach((line, index) => {
    const y = startY + (index * lineHeight);
    let x = width / 2;

    if (style.textAlign === 'left') {
      x = scaledPadding;
    } else if (style.textAlign === 'right') {
      x = width - scaledPadding;
    }

    ctx.fillText(line, x, y);
  });

  ctx.restore();
}

async function renderTextPost(textPost: TextPostData, scale: number): Promise<ArrayBuffer> {
  const width = Math.round(1080 * scale);
  const height = Math.round(1080 * scale);
  
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const style = textPost.style;

  // Fill background
  if (style.backgroundImage) {
    try {
      // Load image from URL
      const response = await fetch(style.backgroundImage);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      ctx.drawImage(imageBitmap, 0, 0, width, height);
      imageBitmap.close();
    } catch (error) {
      // Fallback to solid color
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    drawText(ctx, width, height, textPost.content, style, scale);
  } else {
    ctx.fillStyle = style.backgroundColor;
    ctx.fillRect(0, 0, width, height);
    drawText(ctx, width, height, textPost.content, style, scale);
  }

  // Convert canvas to blob then to ArrayBuffer
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await blob.arrayBuffer();
}

async function createImageThumbnail(imageData: ArrayBuffer, maxWidth: number, maxHeight: number): Promise<ArrayBuffer> {
  // Create ImageBitmap from ArrayBuffer
  const imageBlob = new Blob([imageData]);
  const imageBitmap = await createImageBitmap(imageBlob);
  
  let width = imageBitmap.width;
  let height = imageBitmap.height;
  
  // Calculate dimensions maintaining aspect ratio
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
  
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    imageBitmap.close();
    throw new Error('Failed to get canvas context');
  }
  
  ctx.drawImage(imageBitmap, 0, 0, width, height);
  imageBitmap.close();
  
  // Convert to JPEG blob
  const jpegBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  return await jpegBlob.arrayBuffer();
}

async function createVideoThumbnail(videoData: ArrayBuffer, maxWidth: number, maxHeight: number): Promise<ArrayBuffer> {
  // Note: Video processing in workers is complex - we'll need to decode video first
  // For now, we'll create a placeholder that the main thread can handle
  // This is a limitation - video decoding in workers requires more setup
  // We'll handle video thumbnails on main thread for now, but keep this interface
  
  // Create a video element proxy using ImageBitmap if possible
  // For full video support, we'd need to use WebCodecs API or handle on main thread
  throw new Error('Video thumbnail generation in worker not yet implemented - use main thread');
}

// Handle messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  
  try {
    let result: ArrayBuffer;
    
    if (request.type === 'renderTextPost') {
      result = await renderTextPost(request.textPost, request.scale);
    } else if (request.type === 'createImageThumbnail') {
      result = await createImageThumbnail(request.imageData, request.maxWidth, request.maxHeight);
    } else if (request.type === 'createVideoThumbnail') {
      // Video thumbnails will be handled on main thread for now
      throw new Error('Video thumbnail generation not supported in worker yet');
    } else {
      throw new Error(`Unknown request type: ${(request as any).type}`);
    }
    
    const response: WorkerResponse = {
      id: request.id,
      success: true,
      result
    };
    
    // Transfer ArrayBuffer for efficiency
    self.postMessage(response, [result]);
  } catch (error: any) {
    const response: WorkerResponse = {
      id: request.id,
      success: false,
      error: error?.message || 'Unknown error'
    };
    
    self.postMessage(response);
  }
});

