import { type CSSProperties, type ReactNode } from 'react';
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

function resolveMedia(sections: PenSectionContent[]): string | null {
  const bySlug = sectionMap(sections);
  for (const slug of ['attachments', 'media', 'cover', 'body', 'pages']) {
    const src = firstImageSrc(bySlug.get(slug)?.doc);
    if (src) return src;
  }
  for (const sec of sections) {
    const src = firstImageSrc(normalizeSection(sec).doc);
    if (src) return src;
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
  return {
    backgroundColor: pres.backgroundColor,
    backgroundImage: pres.backgroundImage ? `url(${pres.backgroundImage})` : undefined,
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
  large
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  /** Larger phone for overlay modal. */
  large?: boolean;
}) {
  const media = resolveMedia(sections);
  const title = resolveTitle(manifest, sections);
  const bodyHtml = resolveBodyHtml(sections, title);
  const pres = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );
  const social = categoryIdForClass(manifest.classId) === 'social';

  let surface: ReactNode;
  if (media) {
    surface = (
      <img
        src={media}
        alt=""
        className="pen-gallery-doc-page pen-gallery-doc-page--media"
        draggable={false}
      />
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
