/**
 * Pick image from camera or photo library on native. Falls back to file input on web.
 */

import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

export type PickSource = 'camera' | 'photos';

/**
 * Pick an image from camera or photo library. On native uses Capacitor Camera.
 * Returns a File compatible with upload flows, or null if cancelled.
 */
export async function pickImageFromNative(source: PickSource): Promise<File | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    const result = await Camera.getPhoto({
      source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
      quality: 90,
      allowEditing: false,
      resultType: 'DataUrl'
    });
    const dataUrl = result.dataUrl;
    if (!dataUrl) return null;
    const file = dataUrlToFile(dataUrl, `image_${Date.now()}.jpg`);
    return file;
  } catch (err) {
    // User cancelled or error
    return null;
  }
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], fileName, { type: mimeType });
}
