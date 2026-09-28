/** Lets publish drive the editor playhead while a page is being flattened. */

type TimelineListener = (timeSec: number) => void;

let bound: TimelineListener | null = null;

export function bindTimelineSample(listener: TimelineListener | null): void {
  bound = listener;
}

export function emitTimelineSample(timeSec: number): void {
  bound?.(timeSec);
}
