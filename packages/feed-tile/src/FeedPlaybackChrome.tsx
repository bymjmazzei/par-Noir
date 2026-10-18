import { useRef } from 'react';
import { engagementRailLayout, useFeedFrameHeight } from './engagementRailLayout.js';
import { SpeakerIcon } from './SpeakerIcon.js';

/** Rail column inset (`right-2`). */
const RAIL_RIGHT_PX = 8;
const MUTE_MIN_PX = 20;
const MUTE_MAX_PX = 32;

export function FeedPlayGlyph() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    </span>
  );
}

/** Centered play glyph while the viewer has paused the slide. */
export function FeedPausedGlyph() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      <FeedPlayGlyph />
    </div>
  );
}

/**
 * Feed mute toggle in the band the engagement rail reserves under itself,
 * centered on the rail column. Place it directly in the feed slide.
 */
export function FeedMuteButton({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const rail = engagementRailLayout(useFeedFrameHeight(ref));
  const size = Math.min(MUTE_MAX_PX, Math.max(MUTE_MIN_PX, rail.bottomPx - 6));
  const bottom = Math.max(2, (rail.bottomPx - size) / 2);
  const right = RAIL_RIGHT_PX + Math.max(0, (rail.iconPx - size) / 2);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={muted ? 'Unmute' : 'Mute'}
      title={muted ? 'Unmute' : 'Mute'}
      className="absolute z-30 flex items-center justify-center text-white [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.85))] hover:opacity-90"
      style={{
        width: size,
        height: size,
        right,
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <SpeakerIcon muted={muted} size={Math.round(size * 0.7)} />
    </button>
  );
}
