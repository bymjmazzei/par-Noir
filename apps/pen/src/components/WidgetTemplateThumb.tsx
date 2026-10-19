/**
 * Widget template art as a screenshot (shipped poster, published poster, committed still).
 * Widgets are layer-only, so page previews that read doc text render them blank.
 */
import { useEffect, useState } from 'react';
import { categoryIdForClass, type PenTemplate } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import type { GalleryMedia } from '../services/penGalleryPreview';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { resolvePublicMediaSignedUrl } from '../services/penPublicFeedMedia';
import { curatedWidgetPosterSrc } from '../services/widgetPosters';
import { previewBundleFromTemplate } from './TemplateGalleryThumb';

export function isWidgetTemplateClass(classId: string | undefined): boolean {
  return Boolean(classId) && categoryIdForClass(classId!) === 'widgets';
}

export function NamedBlackTile({ name }: { name: string }) {
  return (
    <div className="pen-named-black-tile">
      <span className="pen-named-black-tile-text">{name}</span>
    </div>
  );
}

function CatalogMediaThumb({
  media,
  session,
  docId = 'preview'
}: {
  media: GalleryMedia;
  session?: PenSession | null;
  docId?: string;
}) {
  const { resolved } = useResolvedMediaSrc(media.src, { docId, session });
  return (
    <div className="pen-white-media-thumb flex items-center justify-center bg-white">
      {resolved ? (
        media.kind === 'video' ? (
          <video
            src={resolved}
            className="max-h-full max-w-full object-contain"
            muted
            playsInline
          />
        ) : (
          <img
            src={resolved}
            alt=""
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        )
      ) : null}
    </div>
  );
}

function PosterImage({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <NamedBlackTile name={title} />;
  return (
    <div className="pen-white-media-thumb flex items-center justify-center bg-white">
      {src ? (
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

function PublicPosterThumb({
  fileId,
  title,
  session
}: {
  fileId: string;
  title: string;
  session?: PenSession | null;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    void resolvePublicMediaSignedUrl(fileId, 'poster', session?.accessToken)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId, session?.accessToken]);
  if (failed) return <NamedBlackTile name={title} />;
  return <PosterImage src={src} title={title} />;
}

export function WidgetTemplateThumb({
  template,
  pn,
  session,
  posterFileId
}: {
  template: PenTemplate;
  pn?: string;
  session?: PenSession | null;
  posterFileId?: string;
}) {
  const curated = curatedWidgetPosterSrc(template.id);
  if (curated) return <PosterImage src={curated} title={template.title} />;
  if (posterFileId) {
    return <PublicPosterThumb fileId={posterFileId} title={template.title} session={session} />;
  }
  const manifest = previewBundleFromTemplate(pn, template)?.manifest;
  const still = manifest?.galleryPreviewPosterRef || manifest?.galleryPreviewRef;
  if (!manifest || !still) {
    return <NamedBlackTile name={template.title} />;
  }
  const media: GalleryMedia = {
    src: still,
    kind: manifest.galleryPreviewPosterRef || manifest.galleryPreviewKind !== 'video' ? 'image' : 'video'
  };
  return <CatalogMediaThumb media={media} session={session} docId={manifest.docId} />;
}
