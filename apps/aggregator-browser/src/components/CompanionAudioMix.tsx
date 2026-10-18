/**
 * Plays poster-owned companion audio while a post is on screen.
 * A licensed song stays musicPenDocId and is not copied into these files.
 * Follows the slide: pauses with it, honors feed mute, and restarts on each video loop.
 */

import { useEffect, useRef, useState } from 'react';
import { resolvePublicMediaObjectUrl } from '../services/feedPreviewPlayback';

export function companionAudioFileIdsOf(metadata: object | null | undefined): string[] {
  const raw = (metadata as { companionAudioFileIds?: unknown } | null | undefined)
    ?.companionAudioFileIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function CompanionAudioMix({
  metadata,
  playing = true,
  muted = true,
  loopEpoch = 0
}: {
  metadata: object;
  playing?: boolean;
  muted?: boolean;
  /** Bumps each time the slide's video wraps; audio rewinds with it. */
  loopEpoch?: number;
}) {
  const fileIds = companionAudioFileIdsOf(metadata);
  const offsetsRaw = (metadata as { companionAudioOffsetsSec?: unknown }).companionAudioOffsetsSec;
  const gainsRaw = (metadata as { companionAudioGains?: unknown }).companionAudioGains;
  const offsets = Array.isArray(offsetsRaw) ? offsetsRaw : [];
  const gains = Array.isArray(gainsRaw) ? gainsRaw : [];
  const refs = useRef<HTMLAudioElement[]>([]);
  const cueKey = fileIds.map((id, i) => `${id}:${offsets[i] ?? 0}:${gains[i] ?? 100}`).join('|');
  const [readyKey, setReadyKey] = useState<string | null>(null);
  /** Play time inside the current loop, so a resume keeps each cue's offset. */
  const clockRef = useRef({ epoch: Number.NaN, elapsedMs: 0, runStart: 0 });

  useEffect(() => {
    let cancelled = false;
    const elements = refs.current;
    setReadyKey(null);
    clockRef.current.epoch = Number.NaN;
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
          } catch {
            /* missing preview */
          }
        })
      );
      if (!cancelled) setReadyKey(cueKey);
    })();
    return () => {
      cancelled = true;
      for (const el of elements) {
        el.pause();
        el.removeAttribute('src');
      }
    };
    // cueKey captures ids, offsets, and gains for this post.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueKey]);

  const ready = readyKey === cueKey;

  useEffect(() => {
    if (!ready) return;
    const elements = refs.current.slice(0, fileIds.length);
    const clock = clockRef.current;
    if (clock.epoch !== loopEpoch) {
      clock.epoch = loopEpoch;
      clock.elapsedMs = 0;
      for (const el of elements) {
        el.pause();
        try {
          el.currentTime = 0;
        } catch {
          /* not seekable yet */
        }
      }
    }
    for (const el of elements) el.muted = muted;
    if (!playing) return;

    clock.runStart = performance.now();
    const timers: number[] = [];
    elements.forEach((el, index) => {
      const offset = Number(offsets[index]);
      const offsetMs = Number.isFinite(offset) && offset > 0 ? offset * 1000 : 0;
      const start = () => {
        if (!el.ended) void el.play().catch(() => undefined);
      };
      const waitMs = offsetMs - clock.elapsedMs;
      if (waitMs <= 0) start();
      else timers.push(window.setTimeout(start, waitMs));
    });
    return () => {
      clock.elapsedMs += performance.now() - clock.runStart;
      for (const timer of timers) window.clearTimeout(timer);
      for (const el of elements) el.pause();
    };
    // cueKey captures ids and offsets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, muted, loopEpoch, cueKey]);

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
