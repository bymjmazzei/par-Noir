/**
 * Which file a video layer plays.
 * The editor prefers the proxy and plays the original until that proxy exists.
 * Publish uses the original.
 */

export function editorPlaybackSrc(
  source:
    | {
        editProxySrc?: string;
        videoSrc?: string;
        backgroundVideo?: string;
        mediaReversed?: boolean;
        reverseProxySrc?: string;
      }
    | null
    | undefined
): string | undefined {
  const proxy = source?.editProxySrc?.trim();
  if (proxy) return proxy;
  const video = source?.videoSrc?.trim();
  if (video) return video;
  const background = source?.backgroundVideo?.trim();
  return background || undefined;
}

export function publishPlaybackSrc(
  source: { videoSrc?: string; backgroundVideo?: string } | null | undefined
): string | undefined {
  const video = source?.videoSrc?.trim();
  if (video) return video;
  const background = source?.backgroundVideo?.trim();
  return background || undefined;
}
