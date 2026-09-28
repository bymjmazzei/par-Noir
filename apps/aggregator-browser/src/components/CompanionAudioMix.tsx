/**
 * Plays poster-owned companion audio while a post is on screen.
 * A licensed song stays musicPenDocId and is not copied into these files.
 */

import { useEffect, useRef } from 'react';
import { resolvePublicMediaObjectUrl } from '../services/feedPreviewPlayback';

export function companionAudioFileIdsOf(metadata: object | null | undefined): string[] {
  const raw = (metadata as { companionAudioFileIds?: unknown } | null | undefined)
    ?.companionAudioFileIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function CompanionAudioMix({ metadata }: { metadata: object }) {
  const fileIds = companionAudioFileIdsOf(metadata);
  const offsetsRaw = (metadata as { companionAudioOffsetsSec?: unknown }).companionAudioOffsetsSec;
  const gainsRaw = (metadata as { companionAudioGains?: unknown }).companionAudioGains;
  const offsets = Array.isArray(offsetsRaw) ? offsetsRaw : [];
  const gains = Array.isArray(gainsRaw) ? gainsRaw : [];
  const refs = useRef<HTMLAudioElement[]>([]);
  const cueKey = fileIds.map((id, i) => `${id}:${offsets[i] ?? 0}:${gains[i] ?? 100}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const elements = refs.current;
    void (async () => {
      await Promise.all(
        fileIds.map(async (id, index) => {
          const el = elements[index];
          if (!el) return;
          try {
            const url = await resolvePublicMediaObjectUrl(id, 'sd');
            if (cancelled) return;
            el.src = url;
            const gain = Number(gains[index]);
            el.volume = Number.isFinite(gain) ? Math.min(1, Math.max(0, gain / 100)) : 1;
            const offset = Number(offsets[index]);
            const waitMs = Number.isFinite(offset) && offset > 0 ? offset * 1000 : 0;
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) void el.play().catch(() => undefined);
              }, waitMs)
            );
          } catch {
            /* missing preview or autoplay block */
          }
        })
      );
    })();
    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      for (const el of elements) {
        el.pause();
        el.removeAttribute('src');
      }
    };
    // cueKey captures ids, offsets, and gains for this post.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

  if (fileIds.length === 0) return null;
  return (
    <div className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden>
      {fileIds.map((id) => (
        <audio
          key={id}
          ref={(node) => {
            if (!node) return;
            const index = fileIds.indexOf(id);
            if (index >= 0) refs.current[index] = node;
          }}
          preload="auto"
        />
      ))}
    </div>
  );
}
