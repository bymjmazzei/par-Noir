/**
 * Attach helpers: device file pickers and the Drive media list.
 * Storing, uploading, and downloading media lives in @par-noir/pen-media.
 */

import { ownerGet } from './penOwnerFetch';

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

export function pickDeviceVideoFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function pickDeviceAudioFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = () => {
      resolve(input.files?.[0] || null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export { probeMediaAspect, probeVideoDisplayAspect, cachedMediaAspect } from './penMediaAspect';

export interface CloudImageItem {
  id: string;
  name: string;
  mimeType?: string;
}

export async function listCloudMedia(
  _accessToken: string,
  pnIdentifier?: string,
  kind: 'image' | 'video' | 'audio' | 'any' = 'any'
): Promise<CloudImageItem[]> {
  const clauses: string[] = ['trashed=false'];
  if (kind === 'image') clauses.unshift("mimeType contains 'image/'");
  else if (kind === 'video') clauses.unshift("mimeType contains 'video/'");
  else if (kind === 'audio') clauses.unshift("mimeType contains 'audio/'");
  else clauses.unshift("(mimeType contains 'image/' or mimeType contains 'video/')");
  const q = encodeURIComponent(clauses.join(' and '));
  const res = await ownerGet(`/api/drive/files?q=${q}&pageSize=60`, { pnIdentifier });
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
