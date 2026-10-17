/**
 * Which file a video layer plays.
 * Editor live preview uses masters only ({@link editorPreviewPlaybackSrc}).
 * {@link editorPlaybackSrc} may prefer a stored proxy (e.g. publish hydrate fallback).
 * Publish always uses masters ({@link publishPlaybackSrc}).
 */

/** Editor preview/timeline — master refs only; ignores editProxySrc. */
export function editorPreviewPlaybackSrc(
  source: { videoSrc?: string; backgroundVideo?: string } | null | undefined
): string | undefined {
  return publishPlaybackSrc(source);
}

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
