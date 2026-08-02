const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|avi|webm|mkv|flv|wmv)$/i;
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a|aac)$/i;

export function isImageFile(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('image/') || IMAGE_EXT_RE.test(fileName);
}

export function isVideoFile(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('video/') || VIDEO_EXT_RE.test(fileName);
}

export function isAudioFile(mimeType: string, fileName: string): boolean {
  return mimeType.startsWith('audio/') || AUDIO_EXT_RE.test(fileName);
}

/** Fetch the latest GitHub release asset matching the current platform and trigger download. */
export async function downloadLatestDesktopApp(): Promise<void> {
  try {
    const response = await fetch('https://api.github.com/repos/bymjmazzei/par-Noir/releases/latest');
    if (!response.ok) {
      throw new Error('Failed to fetch release info');
    }

    const release = await response.json();
    const assets = release.assets || [];

    const platform = navigator.platform.toLowerCase();
    let downloadUrl: string | null = null;

    if (platform.includes('mac') || platform.includes('darwin')) {
      const dmgAsset = assets.find(
        (asset: { name: string; browser_download_url?: string }) =>
          asset.name.includes('.dmg') && !asset.name.includes('blockmap')
      );
      downloadUrl = dmgAsset?.browser_download_url || null;
    } else if (platform.includes('win')) {
      const exeAsset = assets.find(
        (asset: { name: string; browser_download_url?: string }) =>
          asset.name.includes('.exe') || asset.name.includes('win')
      );
      downloadUrl = exeAsset?.browser_download_url || null;
    } else {
      const linuxAsset = assets.find(
        (asset: { name: string; browser_download_url?: string }) =>
          asset.name.includes('.AppImage') ||
          asset.name.includes('.tar.gz') ||
          asset.name.includes('linux')
      );
      downloadUrl = linuxAsset?.browser_download_url || null;
    }

    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadUrl.split('/').pop() || 'par-Noir-Desktop';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      window.open(release.html_url, '_blank');
    }
  } catch (error) {
    console.error('Failed to download desktop app:', error);
    window.open('https://github.com/bymjmazzei/par-Noir/releases/latest', '_blank');
  }
}
