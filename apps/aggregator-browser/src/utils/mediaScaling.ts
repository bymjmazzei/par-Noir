/**
 * Media Scaling Utility
 * Provides consistent scaling logic for images, videos, and other media
 * Scales based on the larger dimension (width or height) with blurred background support
 */

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface ContainerDimensions {
  width: number;
  height: number;
}

export interface MediaScalingStyles {
  mainMedia: React.CSSProperties;
  background: React.CSSProperties;
}

/**
 * Calculate scaling styles for media based on its dimensions and container
 * Scales to fit based on the larger dimension (width or height)
 * 
 * @param mediaDims - Natural dimensions of the media (width, height)
 * @param containerDims - Dimensions of the container (width, height)
 * @param defaultAspect - Default aspect ratio if media dimensions are not available (default: 16/9)
 * @returns Styles for main media and blurred background
 */
export function calculateMediaScaling(
  mediaDims: MediaDimensions | null | undefined,
  containerDims: ContainerDimensions,
  defaultAspect: number = 16 / 9
): MediaScalingStyles {
  const containerWidth = containerDims.width;
  const containerHeight = containerDims.height;
  const containerAspect = containerWidth / containerHeight;

  // Use provided dimensions or default aspect ratio
  const mediaAspect = mediaDims
    ? mediaDims.width / mediaDims.height
    : defaultAspect;

  // Determine if media is wider or taller than container
  const isWidescreen = mediaAspect > containerAspect;

  // Background style: always fill container, scaled appropriately
  // If image is wider than container (widescreen), scale background to fill height
  // If image is taller than container (portrait), scale background to fill width
  const backgroundStyle: React.CSSProperties = {
    filter: 'blur(40px)',
    opacity: 0.6,
    zIndex: 0,
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    objectFit: 'cover', // Ensure it covers the entire area
    ...(isWidescreen
      ? {
          width: 'auto',
          height: '100%',
          left: '50%',
          transform: 'translateX(-50%) scale(1.1)',
        }
      : {
          height: 'auto',
          width: '100%',
          top: '50%',
          transform: 'translateY(-50%) scale(1.1)',
        }),
  };

  // Main media style: scale to fit based on larger dimension
  // Use object-contain to maintain aspect ratio
  const mainMediaStyle: React.CSSProperties = {
    height: '100%',
    width: '100%',
    objectFit: 'contain', // Maintain aspect ratio, fill container
    imageRendering: 'auto' as const,
    // Prevent pixelation and ensure high quality
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    transform: 'translateZ(0)', // Force hardware acceleration
  };

  return {
    mainMedia: mainMediaStyle,
    background: backgroundStyle,
  };
}

/**
 * Get container dimensions from window (accounting for UI elements)
 * @param bottomOffset - Offset from bottom (e.g., for navigation bar, default: 64)
 * @returns Container dimensions
 */
export function getContainerDimensions(bottomOffset: number = 64): ContainerDimensions {
  if (typeof window === 'undefined') {
    return { width: 1920, height: 1080 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight - bottomOffset,
  };
}

