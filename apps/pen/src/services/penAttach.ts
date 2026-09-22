/**
 * Attach helpers: device file, Drive cloud list/download, URL.
 * Inserts use data URLs so TipTap/img works without auth on src.
 */

import { API_ENDPOINT } from '../config/api';

export function pickDeviceImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

export interface CloudImageItem {
  id: string;
  name: string;
  mimeType?: string;
}

/** List image files from the user's Drive via first-party API. */
export async function listCloudImages(accessToken: string): Promise<CloudImageItem[]> {
  const q = encodeURIComponent("mimeType contains 'image/' and trashed=false");
  const res = await fetch(`${API_ENDPOINT}/api/drive/files?q=${q}&pageSize=40`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('cloud_list_failed');
  const data = (await res.json()) as {
    files?: Array<{ id?: string; name?: string; mimeType?: string }>;
  };
  return (data.files || [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: String(f.id),
      name: String(f.name),
      mimeType: f.mimeType
    }));
}

/** Download Drive file bytes and return a data URL for editor insert. */
export async function downloadCloudImageAsDataUrl(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `${API_ENDPOINT}/api/drive/files/${encodeURIComponent(fileId)}?download=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error('cloud_download_failed');
  const blob = await res.blob();
  return fileToDataUrl(new File([blob], 'cloud-image', { type: blob.type || 'image/png' }));
}

/** Optional custody upload (unencrypted image); returns Drive fileId when ok. */
export async function uploadDeviceImageToDrive(
  accessToken: string,
  file: File
): Promise<string | null> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
    const res = await fetch(`${API_ENDPOINT}/api/drive/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileData: base64,
        fileName: file.name || 'pen-image.png',
        mimeType: file.type || 'image/png',
        encrypt: false
      })
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string; file?: { id?: string } };
    return data.id || data.file?.id || null;
  } catch {
    return null;
  }
}
