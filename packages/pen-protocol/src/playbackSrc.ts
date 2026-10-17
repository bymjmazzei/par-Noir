/** The one file a video layer (or page background video) plays, in the editor and in the feed. */
export function publishPlaybackSrc(
  source: { videoSrc?: string; backgroundVideo?: string } | null | undefined
): string | undefined {
  const video = source?.videoSrc?.trim();
  if (video) return video;
  const background = source?.backgroundVideo?.trim();
  return background || undefined;
}
