/**
 * Me Page Cover Generator
 * Generates a composite image of Par-Noir background with logo overlay
 * Used as a placeholder when users have no media posts on their me page
 */

// Cache the generated cover image URL
let cachedCoverUrl: string | null = null;

/**
 * Load an image and return a promise that resolves when loaded
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Generate the me page cover image (background + logo overlay)
 * Returns a data URL that can be used as an image source
 * Result is cached in memory to avoid regeneration
 */
export async function getMePageCoverUrl(): Promise<string> {
  // Return cached URL if available
  if (cachedCoverUrl) {
    return cachedCoverUrl;
  }

  try {
    // Canvas dimensions for vertical feed (standard post size)
    const width = 1080;
    const height = 1920;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Load background image
    // Path relative to public directory - branding assets should be accessible
    const backgroundPath = '/branding/Par-Noir-Background-Dark.png';
    const backgroundImg = await loadImage(backgroundPath);

    // Draw background - fill entire canvas, maintaining aspect ratio
    // Scale to cover the canvas (similar to CSS background-size: cover)
    const bgAspect = backgroundImg.width / backgroundImg.height;
    const canvasAspect = width / height;

    if (bgAspect > canvasAspect) {
      // Background is wider - fit to height
      const scaledWidth = height * bgAspect;
      ctx.drawImage(backgroundImg, (width - scaledWidth) / 2, 0, scaledWidth, height);
    } else {
      // Background is taller - fit to width
      const scaledHeight = width / bgAspect;
      ctx.drawImage(backgroundImg, 0, (height - scaledHeight) / 2, width, scaledHeight);
    }

    // Load logo image
    const logoPath = '/branding/Par-Noir-Logo-White.png';
    const logoImg = await loadImage(logoPath);

    // Calculate logo size - scale to ~35% of canvas width
    const logoScale = 0.35;
    const logoWidth = width * logoScale;
    const logoAspect = logoImg.width / logoImg.height;
    const logoHeight = logoWidth / logoAspect;

    // Center logo on canvas
    const logoX = (width - logoWidth) / 2;
    const logoY = (height - logoHeight) / 2;

    // Draw logo with slight transparency for better blending
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
    ctx.globalAlpha = 1.0;

    // Convert canvas to data URL
    cachedCoverUrl = canvas.toDataURL('image/png');
    return cachedCoverUrl;
  } catch (error) {
    console.error('Failed to generate me page cover:', error);
    // Return a fallback - solid color with text
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1080, 1920);
      ctx.fillStyle = '#ffffff';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Par-Noir', 540, 960);
    }
    cachedCoverUrl = canvas.toDataURL('image/png');
    return cachedCoverUrl;
  }
}

