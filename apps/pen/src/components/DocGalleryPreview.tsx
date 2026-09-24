import { type CSSProperties, type ReactNode } from 'react';
import { PenMediaPlayer } from '@par-noir/feed-tile';
import {
  categoryIdForClass,
  defaultPagePresentation,
  docToHtml,
  docToPlainText,
  mergePagePresentation,
  normalizeSection,
  type PenDocManifest,
  type PenPagePresentation,
  type PenSectionContent,
  type PenTipTapNode
} from '@par-noir/pen-protocol';
import { useResolvedMediaSrc } from '../hooks/useResolvedMediaSrc';
import { isPenMediaSrcRef } from '../services/penLocalMedia';
import type { PenSession } from '../services/penSession';

type GalleryMedia = { src: string; kind: 'image' | 'video' };

function sectionMap(sections: PenSectionContent[]): Map<string, PenSectionContent> {
  return new Map(
    sections.map((s) => {
      const n = normalizeSection(s);
      return [n.slug, n];
    })
  );
}

function firstImageSrc(doc: PenTipTapNode | undefined): string | null {
  if (!doc) return null;
  const walk = (n: PenTipTapNode): string | null => {
    if (n.type === 'image' && n.attrs?.src) return String(n.attrs.src);
    for (const c of n.content || []) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return null;
  };
  return walk(doc);
}

function firstLayerMedia(sections: PenSectionContent[]): GalleryMedia | null {
  for (const raw of sections) {
    const sec = normalizeSection(raw);
    const visible = (sec.layers || []).filter((l) => l.visible !== false);
    const video = visible.find((l) => l.kind === 'video' && l.videoSrc);
    if (video?.videoSrc) return { src: video.videoSrc, kind: 'video' };
    const image = visible.find((l) => l.kind === 'image' && l.imageSrc);
    if (image?.imageSrc) return { src: image.imageSrc, kind: 'image' };
    const bgVideo = visible.find((l) => l.backgroundVideo);
    if (bgVideo?.backgroundVideo) {
      return { src: bgVideo.backgroundVideo, kind: 'video' };
    }
    const bgImage = visible.find((l) => l.backgroundImage);
    if (bgImage?.backgroundImage) {
      return { src: bgImage.backgroundImage, kind: 'image' };
    }
  }
  return null;
}

function resolveMedia(
  sections: PenSectionContent[],
  pagePresentation?: PenPagePresentation | null
): GalleryMedia | null {
  const fromLayers = firstLayerMedia(sections);
  if (fromLayers) return fromLayers;
  if (pagePresentation?.backgroundVideo) {
    return { src: pagePresentation.backgroundVideo, kind: 'video' };
  }
  if (pagePresentation?.backgroundImage) {
    return { src: pagePresentation.backgroundImage, kind: 'image' };
  }
  const bySlug = sectionMap(sections);
  for (const slug of ['attachments', 'media', 'cover', 'body', 'pages', 'front']) {
    const src = firstImageSrc(bySlug.get(slug)?.doc);
    if (src) return { src, kind: 'image' };
  }
  for (const sec of sections) {
    const src = firstImageSrc(normalizeSection(sec).doc);
    if (src) return { src, kind: 'image' };
  }
  return null;
}

function resolveTitle(manifest: PenDocManifest, sections: PenSectionContent[]): string {
  const bySlug = sectionMap(sections);
  const titleSec = bySlug.get('title');
  const fromSec = titleSec ? docToPlainText(titleSec.doc).trim() : '';
  return fromSec || manifest.title || 'Untitled';
}

function resolveBodyHtml(sections: PenSectionContent[], title: string): string {
  const bySlug = sectionMap(sections);
  const bodySec = bySlug.get('body') || bySlug.get('caption') || sections[0];
  if (!bodySec) return '';
  const html = docToHtml(normalizeSection(bodySec).doc);
  if (html === `<p>${title}</p>`) return '';
  return html;
}

function presentationSurface(pres: PenPagePresentation, fontSize: number): CSSProperties {
  // Never put penmedia:/penlocal: into CSS url(...) — browser cannot fetch those schemes.
  const bg =
    pres.backgroundImage && !isPenMediaSrcRef(pres.backgroundImage)
      ? `url(${pres.backgroundImage})`
      : undefined;
  return {
    backgroundColor: pres.backgroundColor,
    backgroundImage: bg,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: pres.textColor,
    fontFamily: pres.fontFamily,
    textAlign: pres.textAlign,
    padding: `${Math.min(Math.max(pres.padding * 0.35, 8), 16)}px`,
    fontSize,
    fontWeight: pres.textStyle === 'bold' ? 700 : 500,
    fontStyle: pres.textStyle === 'italic' ? 'italic' : undefined,
    textShadow: `${pres.dropShadowOffsetX * 0.4}px ${pres.dropShadowOffsetY * 0.4}px ${
      Math.max(pres.dropShadowBlur * 0.4, 2)
    }px ${pres.dropShadowColor}`
  };
}

function pageAspect(manifest: PenDocManifest): string | undefined {
  if (manifest.pageLayout === 'letter') return '8.5 / 11';
  if (manifest.pageLayout === 'a4') return '210 / 297';
  return '3 / 4';
}

function PhoneShell({
  children,
  large
}: {
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div className={`pen-gallery-phone${large ? ' pen-gallery-phone--lg' : ''}`}>
      <div className="pen-gallery-phone-bezel">
        <div className="pen-gallery-phone-screen">{children}</div>
      </div>
    </div>
  );
}

/**
 * Library / template gallery thumb: doc page scaled to tile width, centered,
 * overflow clipped. Social templates sit in a phone bezel so dark screens stay edged.
 */
export function DocGalleryPreview({
  manifest,
  sections,
  large,
  session
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  /** Larger phone for overlay modal. */
  large?: boolean;
  session?: PenSession | null;
}) {
  const media = resolveMedia(sections, manifest.pagePresentation);
  const { resolved } = useResolvedMediaSrc(media?.src, {
    docId: manifest.docId,
    session
  });
  const title = resolveTitle(manifest, sections);
  const bodyHtml = resolveBodyHtml(sections, title);
  const pres = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );
  const social = categoryIdForClass(manifest.classId) === 'social';

  const mediaFrameStyle =
    large
      ? {
          aspectRatio: social ? '9 / 16' : pageAspect(manifest),
          height: social ? '100%' : undefined,
          width: '100%',
          position: 'relative' as const
        }
      : { width: '100%', height: '100%', position: 'relative' as const };

  let surface: ReactNode;
  if (media) {
    // Media-forward: still/video fills the tile; caption overlays for social value.
    // Never put unresolved penmedia:/penlocal: into <img>/<video> src.
    surface = (
      <div
        className="pen-gallery-doc-page pen-gallery-doc-page--media-stack"
        style={mediaFrameStyle}
      >
        {resolved ? (
          media.kind === 'video' ? (
            <div
              className="pen-gallery-doc-page pen-gallery-doc-page--media"
              style={{ width: '100%', height: '100%' }}
            >
              <PenMediaPlayer
                src={resolved}
                className="h-full w-full [&_video]:object-cover"
              />
            </div>
          ) : (
            <img
              src={resolved}
              alt=""
              className="pen-gallery-doc-page pen-gallery-doc-page--media"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              draggable={false}
            />
          )
        ) : (
          <div
            className="pen-gallery-doc-page pen-gallery-doc-page--media"
            style={{ width: '100%', height: '100%', background: '#e5e5e5' }}
            aria-hidden
          />
        )}
        {title && title !== 'Untitled' ? (
          <div
            className="absolute inset-x-0 bottom-0 line-clamp-3 px-1.5 py-1 text-[10px] leading-snug text-white"
            style={{
              background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
              fontFamily: pres.fontFamily
            }}
          >
            {title}
          </div>
        ) : null}
      </div>
    );
  } else if (
    social ||
    manifest.docType === 'note' ||
    manifest.docType === 'post' ||
    manifest.docType === 'collection' ||
    Boolean(manifest.pagePresentation)
  ) {
    surface = (
      <div
        className="pen-gallery-doc-page pen-gallery-doc-page--surface"
        style={{
          ...presentationSurface(pres, large ? 18 : 11),
          /* Tile frame owns size; modal large keeps intrinsic page shape */
          ...(large
            ? {
                aspectRatio: social ? '9 / 16' : pageAspect(manifest),
                height: social ? '100%' : undefined,
                width: '100%'
              }
            : { width: '100%', height: '100%' })
        }}
      >
        <div className="line-clamp-[10] break-words leading-snug">{title}</div>
        {bodyHtml ? (
          <div
            className="pen-rich-html mt-1.5 line-clamp-5 text-[0.7em] opacity-90 [&_*]:text-inherit"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : null}
      </div>
    );
  } else {
    surface = (
      <div
        className="pen-gallery-doc-page pen-gallery-doc-page--paper"
        style={
          large
            ? { aspectRatio: pageAspect(manifest) }
            : { width: '100%', height: '100%' }
        }
      >
        <div className="pen-gallery-doc-paper-title">{title}</div>
        {bodyHtml ? (
          <div
            className="pen-rich-html pen-gallery-doc-paper-body"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        ) : null}
      </div>
    );
  }

  if (social) {
    return (
      <PhoneShell large={large}>
        {surface}
      </PhoneShell>
    );
  }

  return surface;
}
