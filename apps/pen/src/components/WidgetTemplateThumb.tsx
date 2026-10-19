/**
 * Widget and platform post template art as a screenshot (shipped poster, committed still).
 * Their art is HTML layers, so feed-tile previews that read doc text and media render them blank.
 */
import { useEffect, useState } from 'react';
import { categoryIdForClass, type PenTemplate } from '@par-noir/pen-protocol';
import type { PenSession } from '../services/penSession';
import type { GalleryMedia } from '../services/penGalleryPreview';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { catalogPosterSrc } from '../services/widgetPosters';
import { previewBundleFromTemplate } from './TemplateGalleryThumb';

export function isWidgetTemplateClass(classId: string | undefined): boolean {
  return Boolean(classId) && categoryIdForClass(classId!) === 'widgets';
}

/** Widgets and platform post templates show their poster on /templates, never a live render. */
export function usesCatalogPoster(template: Pick<PenTemplate, 'id' | 'classId'>): boolean {
  return isWidgetTemplateClass(template.classId) || Boolean(catalogPosterSrc(template.id));
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

export function WidgetTemplateThumb({
  template,
  pn,
  session
}: {
  template: PenTemplate;
  pn?: string;
  session?: PenSession | null;
}) {
  const curated = catalogPosterSrc(template.id);
  if (curated) return <PosterImage src={curated} title={template.title} />;
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
