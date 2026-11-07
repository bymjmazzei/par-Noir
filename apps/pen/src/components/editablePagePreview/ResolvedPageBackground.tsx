import { publishPlaybackSrc } from '@par-noir/pen-protocol';
import { PenMediaPlayer } from '@par-noir/feed-tile';
import { usePlaybackMode } from '../../hooks/usePlaybackMode';
import { useResolvedMediaSrc } from '../../hooks/useResolvedMediaSrc';
import { getAttachPoster } from '../../services/attachPosterCache';
import type { PenSession } from '../../services/penSession';

export function ResolvedPageBackground({
  src,
  kind,
  docId,
  session,
  videoSrc
}: {
  src: string;
  kind: 'image' | 'video';
  docId?: string;
  session?: PenSession | null;
  videoSrc?: string;
}) {
  const playback = usePlaybackMode();
  const playSrc =
    kind === 'video'
      ? publishPlaybackSrc({ videoSrc, backgroundVideo: src })
      : src;
  const { resolved } = useResolvedMediaSrc(playSrc, { docId, session });
  const posterUrl =
    kind === 'video' && playSrc && !resolved
      ? getAttachPoster(publishPlaybackSrc({ videoSrc, backgroundVideo: src }))
      : null;
  if (!playSrc && kind === 'video') return null;
  if (kind === 'video') {
    const videoStyle = { objectFit: 'cover' as const };
    return (
      <div
        data-pen-playback={playback}
        data-pen-page-background="video"
        className="pointer-events-none absolute inset-0 z-0"
      >
        {!resolved ? (
          posterUrl ? (
            <img src={posterUrl} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <div className="h-full w-full bg-neutral-200/80" aria-hidden />
          )
        ) : null}
        {resolved ? (
          <PenMediaPlayer src={resolved} className="h-full w-full" videoStyle={videoStyle} />
        ) : null}
      </div>
    );
  }
  if (!resolved) return null;
  return (
    <div
      data-pen-page-background="image"
      className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
      style={{ backgroundImage: `url(${resolved})` }}
    />
  );
}
