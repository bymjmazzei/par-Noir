/**
 * Media Metadata Extractor
 * Extracts technical metadata from image, video, and audio files
 * Returns metadata that becomes static (non-editable) in the semantic web structure
 */

export interface ExtractedMediaMetadata {
  // Image metadata
  width?: number;
  height?: number;
  
  // Video metadata
  duration?: number; // seconds
  frameRate?: number; // fps
  videoWidth?: number;
  videoHeight?: number;
  
  // Audio metadata
  audioSampleRate?: number; // Hz
  audioChannels?: number;
  
  // Derived fields
  videoQuality?: string; // e.g., "1080p", "4K"
  aspectRatio?: string; // e.g., "16:9", "4:3"
}

/**
 * Extract metadata from an image file
 */
export async function extractImageMetadata(file: File): Promise<ExtractedMediaMetadata> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const aspectRatio = calculateAspectRatio(width, height);
      
      resolve({
        width,
        height,
        aspectRatio
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({}); // Return empty metadata if extraction fails
    };
    
    img.src = url;
  });
}

/**
 * Extract metadata from a video file
 */
export async function extractVideoMetadata(file: File): Promise<ExtractedMediaMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    let metadataLoaded = false;
    
    video.onloadedmetadata = () => {
      if (metadataLoaded) return;
      metadataLoaded = true;
      
      URL.revokeObjectURL(url);
      
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const aspectRatio = calculateAspectRatio(width, height);
      const videoQuality = getVideoQuality(height);
      
      // Try to get frame rate (not always available)
      // We'll use a default if not available
      const frameRate = 30; // Default assumption
      
      resolve({
        duration,
        width,
        height,
        videoWidth: width,
        videoHeight: height,
        frameRate,
        videoQuality,
        aspectRatio
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    
    video.preload = 'metadata';
    video.src = url;
  });
}

/**
 * Extract metadata from an audio file
 */
export async function extractAudioMetadata(file: File): Promise<ExtractedMediaMetadata> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    
    let metadataLoaded = false;
    
    audio.onloadedmetadata = () => {
      if (metadataLoaded) return;
      metadataLoaded = true;
      
      URL.revokeObjectURL(url);
      
      const duration = audio.duration;
      
      // Note: Audio sample rate and channels are not easily accessible via HTML5 Audio API
      // These would require Web Audio API or server-side processing for accurate extraction
      // For now, we'll extract what we can
      resolve({
        duration
      });
    };
    
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    
    audio.preload = 'metadata';
    audio.src = url;
  });
}

/**
 * Extract metadata from any media file
 */
export async function extractMediaMetadata(file: File): Promise<ExtractedMediaMetadata> {
  const mimeType = file.type || '';
  
  if (mimeType.startsWith('image/')) {
    return extractImageMetadata(file);
  } else if (mimeType.startsWith('video/')) {
    return extractVideoMetadata(file);
  } else if (mimeType.startsWith('audio/')) {
    return extractAudioMetadata(file);
  }
  
  return {}; // No metadata for non-media files
}

/**
 * Format duration in seconds to ISO 8601 duration format
 * e.g., 90 seconds -> "PT1M30S"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (secs > 0) duration += `${secs}S`;
  
  return duration || 'PT0S';
}

/**
 * Calculate aspect ratio from width and height
 */
function calculateAspectRatio(width: number, height: number): string {
  if (!width || !height) return '';
  
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const ratioWidth = width / divisor;
  const ratioHeight = height / divisor;
  
  // Common ratios
  if (ratioWidth === 16 && ratioHeight === 9) return '16:9';
  if (ratioWidth === 4 && ratioHeight === 3) return '4:3';
  if (ratioWidth === 1 && ratioHeight === 1) return '1:1';
  if (ratioWidth === 21 && ratioHeight === 9) return '21:9';
  
  return `${ratioWidth}:${ratioHeight}`;
}

/**
 * Determine video quality from height
 */
function getVideoQuality(height: number): string {
  if (!height) return '';
  
  if (height >= 2160) return '4K';
  if (height >= 1440) return '1440p';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  if (height >= 480) return '480p';
  if (height >= 360) return '360p';
  
  return `${height}p`;
}

