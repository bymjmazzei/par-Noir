/**
 * Editor playback uses the proxy. Publish flips this so the page masters
 * load the original for the one compose pass, then flips back.
 */

export type PlaybackMode = 'edit' | 'publish';

let mode: PlaybackMode = 'edit';
const listeners = new Set<() => void>();

export function playbackMode(): PlaybackMode {
  return mode;
}

export function setPlaybackMode(next: PlaybackMode): void {
  if (mode === next) return;
  mode = next;
  for (const listener of listeners) listener();
}

export function subscribePlaybackMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
