/**
 * Pen → Browse "Connect to feed" deep-link.
 * Cross-origin: payload rides in the browse URL hash (sessionStorage is origin-scoped).
 * Composed video blobs ride postMessage from opener → Browse (cannot fit in the hash).
 */

import type { CompileToNoteResult } from '@par-noir/pen-protocol';

export const PEN_PUBLISH_HASH_PREFIX = 'pen_publish_handoff_v1:' as const;
export const PEN_COMPOSED_MEDIA_READY = 'pen_composed_media_ready' as const;
export const PEN_COMPOSED_MEDIA_BLOBS = 'pen_composed_media_blobs' as const;

export type PenSocialHandoffPayload = CompileToNoteResult & {
  docId?: string;
  headProof?: unknown;
  aggregatorTargets?: string[];
  penClassId?: string;
  penCategoryId?: string;
  penTemplateKind?: 'template' | 'remix';
  basedOnTemplateId?: string;
  penIrRef?: { objectId?: string; publicUrl?: string };
  licensing?: unknown;
};

export type PenComposedMediaHandoffMeta = {
  contentClass: 'media';
  fileType: 'video';
  title: string;
  docId: string;
  templateId?: string;
  headProof?: unknown;
  aggregatorTargets?: string[];
  penClassId?: string;
  penCategoryId?: string;
  penTemplateKind?: 'template' | 'remix';
  basedOnTemplateId?: string;
  penIrRef?: { objectId?: string; publicUrl?: string };
  licensing?: unknown;
  /** Browse should request blobs from opener via postMessage. */
  awaitingComposedBlobs: true;
  videoContentType: string;
  durationMs?: number;
  width?: number;
  height?: number;
};

/** Ordered pages for mixed Note + per-page composed video → collection. */
export type PenMixedPageHandoffMeta = {
  contentClass: 'collection';
  title: string;
  docId: string;
  templateId?: string;
  headProof?: unknown;
  aggregatorTargets?: string[];
  penClassId?: string;
  penCategoryId?: string;
  penTemplateKind?: 'template' | 'remix';
  basedOnTemplateId?: string;
  penIrRef?: { objectId?: string; publicUrl?: string };
  licensing?: unknown;
  awaitingComposedBlobs: true;
  /** Page order: note pages inline; video slots filled from postMessage files by videoIndex. */
  pages: Array<
    | { kind: 'note'; slug: string; content: string; style?: unknown; doc?: unknown }
    | { kind: 'video'; slug: string; videoIndex: number }
  >;
  videoCount: number;
};

export const PEN_MIXED_PAGES_BLOBS = 'pen_mixed_pages_blobs' as const;

const envBrowse =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: { VITE_BROWSE_URL?: string } }).env?.VITE_BROWSE_URL
    : undefined;

export function browseOrigin(): string {
  const raw = (envBrowse && String(envBrowse).trim()) || '';
  if (raw) return raw.replace(/\/$/, '');
  if (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    return 'http://127.0.0.1:5173';
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('web.app')) {
    return 'https://browse-parnoir.web.app';
  }
  return 'https://browse.parnoir.com';
}

export function buildPenPublishHandoffHash(
  payload: PenSocialHandoffPayload | PenComposedMediaHandoffMeta | PenMixedPageHandoffMeta
): string {
  return `#${PEN_PUBLISH_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

/** Open Browse on the upload/composer path with the handoff in the hash. */
export function openBrowseWithPenHandoff(payload: PenSocialHandoffPayload): void {
  const url = `${browseOrigin()}/?view=upload${buildPenPublishHandoffHash(payload)}`;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) {
    window.location.assign(url);
  }
}

/**
 * Open Browse with composed-media metadata; deliver video+poster blobs via postMessage
 * once Browse signals ready (cross-origin safe).
 */
export function openBrowseWithComposedMediaHandoff(
  meta: PenComposedMediaHandoffMeta,
  blobs: { videoBlob: Blob; posterBlob: Blob }
): void {
  const origin = browseOrigin();
  const url = `${origin}/?view=upload${buildPenPublishHandoffHash(meta)}`;
  // Keep opener for postMessage (do not use noopener).
  const w = window.open(url, '_blank');
  if (!w) {
    throw new Error('popup_blocked_composed_media');
  }

  const videoFile = new File(
    [blobs.videoBlob],
    meta.videoContentType.includes('mp4') ? 'pen-compose.mp4' : 'pen-compose.webm',
    { type: blobs.videoBlob.type || meta.videoContentType }
  );
  const posterFile = new File([blobs.posterBlob], 'pen-compose-poster.jpg', {
    type: 'image/jpeg'
  });

  let delivered = false;
  const deliver = () => {
    if (delivered || w.closed) return;
    delivered = true;
    const targets = [
      origin,
      'https://browse.parnoir.com',
      'https://browse-parnoir.web.app'
    ];
    for (const target of [...new Set(targets)]) {
      try {
        w.postMessage(
          {
            type: PEN_COMPOSED_MEDIA_BLOBS,
            meta,
            videoFile,
            posterFile
          },
          target
        );
      } catch {
        /* ignore */
      }
    }
  };

  const onMsg = (e: MessageEvent) => {
    const allowed =
      e.origin === origin ||
      e.origin === 'https://browse.parnoir.com' ||
      e.origin === 'https://browse-parnoir.web.app' ||
      /localhost|127\.0\.0\.1/.test(e.origin);
    if (!allowed) return;
    if (e.data?.type === PEN_COMPOSED_MEDIA_READY) {
      deliver();
      window.removeEventListener('message', onMsg);
    }
  };
  window.addEventListener('message', onMsg);

  let attempts = 0;
  const tick = window.setInterval(() => {
    attempts += 1;
    if (delivered || w.closed || attempts > 40) {
      window.clearInterval(tick);
      if (!delivered) window.removeEventListener('message', onMsg);
      return;
    }
    try {
      w.postMessage({ type: 'pen_composed_media_ping' }, origin);
    } catch {
      /* ignore */
    }
  }, 400);
}

/**
 * Mixed Note + video pages: open Browse as a collection; deliver video files via postMessage.
 */
export function openBrowseWithMixedPagesHandoff(
  meta: PenMixedPageHandoffMeta,
  videos: Array<{ videoBlob: Blob; posterBlob: Blob; contentType: string }>
): void {
  const origin = browseOrigin();
  const url = `${origin}/?view=upload${buildPenPublishHandoffHash(meta)}`;
  const w = window.open(url, '_blank');
  if (!w) {
    throw new Error('popup_blocked_mixed_pages');
  }

  const videoFiles = videos.map(
    (v, i) =>
      new File(
        [v.videoBlob],
        v.contentType.includes('mp4') ? `pen-page-${i}.mp4` : `pen-page-${i}.webm`,
        { type: v.videoBlob.type || v.contentType }
      )
  );
  const posterFiles = videos.map(
    (v, i) =>
      new File([v.posterBlob], `pen-page-${i}-poster.jpg`, { type: 'image/jpeg' })
  );

  let delivered = false;
  const deliver = () => {
    if (delivered || w.closed) return;
    delivered = true;
    const targets = [
      origin,
      'https://browse.parnoir.com',
      'https://browse-parnoir.web.app'
    ];
    for (const target of [...new Set(targets)]) {
      try {
        w.postMessage(
          {
            type: PEN_MIXED_PAGES_BLOBS,
            meta,
            videoFiles,
            posterFiles
          },
          target
        );
      } catch {
        /* ignore */
      }
    }
  };

  const onMsg = (e: MessageEvent) => {
    const allowed =
      e.origin === origin ||
      e.origin === 'https://browse.parnoir.com' ||
      e.origin === 'https://browse-parnoir.web.app' ||
      /localhost|127\.0\.0\.1/.test(e.origin);
    if (!allowed) return;
    if (e.data?.type === PEN_COMPOSED_MEDIA_READY) {
      deliver();
      window.removeEventListener('message', onMsg);
    }
  };
  window.addEventListener('message', onMsg);

  let attempts = 0;
  const tick = window.setInterval(() => {
    attempts += 1;
    if (delivered || w.closed || attempts > 40) {
      window.clearInterval(tick);
      if (!delivered) window.removeEventListener('message', onMsg);
      return;
    }
    try {
      w.postMessage({ type: 'pen_composed_media_ping' }, origin);
    } catch {
      /* ignore */
    }
  }, 400);
}
