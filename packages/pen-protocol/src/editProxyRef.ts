/**
 * Which file a video layer plays.
 * The editor uses the proxy only. Publish uses the original.
 */

export function editorPlaybackSrc(
  source: { editProxySrc?: string } | null | undefined
): string | undefined {
  const src = source?.editProxySrc?.trim();
  return src || undefined;
}

export function publishPlaybackSrc(
  source: { videoSrc?: string; backgroundVideo?: string } | null | undefined
): string | undefined {
  const video = source?.videoSrc?.trim();
  if (video) return video;
  const background = source?.backgroundVideo?.trim();
  return background || undefined;
}
