/**
 * Editor playhead outside React state. The timeline and publish flatten write here
 * many times a second; only components that read the playhead re-render, not the editor.
 */

import { useCallback, useSyncExternalStore } from 'react';

let playheadSec = 0;
const listeners = new Set<() => void>();

export function getPlayheadSec(): number {
  return playheadSec;
}

export function setPlayheadSec(next: number): void {
  if (!Number.isFinite(next) || next === playheadSec) return;
  playheadSec = next;
  for (const fn of listeners) fn();
}

export function subscribePlayhead(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const idle = () => () => undefined;
const zero = () => 0;

/** Live playhead; pass `false` to skip subscribing (returns 0) when a caller has its own clock. */
export function usePlayheadSec(enabled = true): number {
  const subscribe = useCallback(
    (fn: () => void) => (enabled ? subscribePlayhead(fn) : idle()),
    [enabled]
  );
  const snapshot = enabled ? getPlayheadSec : zero;
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
