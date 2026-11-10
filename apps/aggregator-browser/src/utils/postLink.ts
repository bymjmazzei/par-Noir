/**
 * Canonical post link and the single share action for posts.
 * Links name the creator so they open the post on the creator's feed.
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { IndexedFile } from '../types/aggregator';
import { getCreatorIdentifier } from './contentClass';
import { copyToClipboard } from './clipboard';

export type SharePostResult = 'copied' | 'shared' | 'cancelled' | 'failed';
/** auto: share sheet on native/touch, clipboard on desktop. */
export type SharePostMode = 'auto' | 'copy' | 'sheet';

export function postShareUrl(
  file: IndexedFile,
  base = `${window.location.origin}${window.location.pathname}`
): string {
  const params = new URLSearchParams();
  const creator = getCreatorIdentifier(file)?.trim();
  if (creator) params.set('creator', creator);
  params.set('file', file.metadata.fileId);
  return `${base}?${params.toString()}`;
}

function hasWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

function prefersShareSheet(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  return coarse && hasWebShare();
}

function isShareCancel(err: unknown): boolean {
  if ((err as { name?: string } | null)?.name === 'AbortError') return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(msg);
}

async function copyLink(url: string): Promise<SharePostResult> {
  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}

async function openShareSheet(file: IndexedFile, url: string): Promise<SharePostResult> {
  const title = file.metadata.title || file.metadata.name || 'par Noir';
  const text = file.metadata.description || '';
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ title, text, url, dialogTitle: 'Share' });
    } else if (hasWebShare()) {
      await navigator.share({ title, text, url });
    } else {
      return copyLink(url);
    }
    return 'shared';
  } catch (err) {
    return isShareCancel(err) ? 'cancelled' : 'failed';
  }
}

export async function sharePostLink(
  file: IndexedFile,
  mode: SharePostMode = 'auto'
): Promise<SharePostResult> {
  const url = postShareUrl(file);
  if (mode === 'sheet' || (mode === 'auto' && prefersShareSheet())) {
    return openShareSheet(file, url);
  }
  return copyLink(url);
}
