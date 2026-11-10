/**
 * Canonical post link and the share actions for posts.
 * Links name the creator so they open the post on the creator's feed.
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import type { IndexedFile } from '../types/aggregator';
import { getCreatorIdentifier } from './contentClass';
import { copyToClipboard } from './clipboard';

export type SharePostResult = 'copied' | 'shared' | 'cancelled' | 'failed';
export type SharePostMode = 'copy' | 'sheet';

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

/** Same-origin post link -> its creator and file; anything else -> null. */
export function parsePostLink(
  url: string,
  origin = window.location.origin
): { creator?: string; fileId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin) return null;
  const fileId = parsed.searchParams.get('file')?.trim();
  if (!fileId) return null;
  const creator = parsed.searchParams.get('creator')?.trim();
  return creator ? { creator, fileId } : { fileId };
}

function hasWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export function canOpenShareSheet(): boolean {
  return Capacitor.isNativePlatform() || hasWebShare();
}

function isShareCancel(err: unknown): boolean {
  if ((err as { name?: string } | null)?.name === 'AbortError') return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(msg);
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
      return 'failed';
    }
    return 'shared';
  } catch (err) {
    return isShareCancel(err) ? 'cancelled' : 'failed';
  }
}

export async function sharePostLink(file: IndexedFile, mode: SharePostMode): Promise<SharePostResult> {
  const url = postShareUrl(file);
  if (mode === 'sheet') return openShareSheet(file, url);
  return (await copyToClipboard(url)) ? 'copied' : 'failed';
}
