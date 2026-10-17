import { readMasterDurationSec } from '@par-noir/feed-tile';
import { probeVideoFileDurationSec } from './probeVideoDuration';

export function layerMediaSyncKey(layerId: string): string {
  return `pen-layer:${layerId}`;
}

/**
 * Prefer duration from the shared PenMediaController master; fall back to a one-shot
 * metadata probe only if the preview player never exposes duration in time.
 */
export async function waitForVideoLayerDurationSec(
  layerId: string,
  resolvedUrl: string,
  opts?: { timeoutMs?: number; pollMs?: number }
): Promise<number | null> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const pollMs = opts?.pollMs ?? 200;
  const key = layerMediaSyncKey(layerId);

  const fromMaster = () => readMasterDurationSec(key);
  let hit = fromMaster();
  if (hit) return hit;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, pollMs));
    hit = fromMaster();
    if (hit) return hit;
  }

  return probeVideoFileDurationSec(resolvedUrl);
}

/** Page background video has no layer sync key — metadata probe only. */
export async function waitForPageBackgroundVideoDurationSec(
  resolvedUrl: string
): Promise<number | null> {
  return probeVideoFileDurationSec(resolvedUrl);
}
