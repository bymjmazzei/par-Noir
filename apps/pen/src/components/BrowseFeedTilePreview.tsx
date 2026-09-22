import { type CSSProperties, type ReactNode } from 'react';
import {
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

function presentationSurface(pres: PenPagePresentation): CSSProperties {
  return {
    backgroundColor: pres.backgroundColor,
    backgroundImage: pres.backgroundImage ? `url(${pres.backgroundImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: pres.textColor,
    fontFamily: pres.fontFamily,
    textAlign: pres.textAlign,
    padding: `${Math.min(Math.max(pres.padding, 16), 48)}px`
  };
}

function textShadowCss(pres: PenPagePresentation): string {
  return `${pres.dropShadowOffsetX}px ${pres.dropShadowOffsetY}px ${pres.dropShadowBlur}px ${pres.dropShadowColor}`;
}

function EngagementRail() {
  const Item = ({
    label,
    children
  }: {
    label: string;
    children: ReactNode;
  }) => (
    <div className="flex flex-col items-center gap-0.5 text-white drop-shadow-md" title={label}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
        {children}
      </div>
      <span className="text-[11px] font-medium tabular-nums">0</span>
    </div>
  );

  return (
    <div className="pointer-events-none absolute bottom-24 right-3 z-20 flex flex-col items-center gap-4">
      <Item label="Like">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
        </svg>
      </Item>
      <Item label="Comment">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
      </Item>
      <Item label="Share">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </Item>
      <Item label="Save">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </Item>
    </div>
  );
}

function resolveCaption(sections: PenSectionContent[], titleFallback: string): string {
  const bySlug = sectionMap(sections);
  const prefer = ['caption', 'body', 'title', 'primary', 'meta'];
  for (const slug of prefer) {
    const sec = bySlug.get(slug);
    if (!sec) continue;
    const plain = docToPlainText(normalizeSection(sec).doc).trim();
    if (plain) return plain;
  }
  for (const sec of sections) {
    const plain = docToPlainText(normalizeSection(sec).doc).trim();
    if (plain) return plain;
  }
  return titleFallback;
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

function TileSurface({
  manifest,
  sections,
  compact
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  compact?: boolean;
}) {
  const pres = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );
  const caption = resolveCaption(sections, manifest.title || '');
  const media = resolveMedia(sections);
  const bySlug = sectionMap(sections);
  const titleSec = bySlug.get('title');
  const displayTitle =
    (titleSec ? docToPlainText(titleSec.doc).trim() : '') || manifest.title || 'Untitled';
  const bodySec = bySlug.get('body') || bySlug.get('caption') || sections[0];
  const bodyHtml = bodySec ? docToHtml(normalizeSection(bodySec).doc) : '';

  const isPost = manifest.docType === 'post' || Boolean(media);
  const shadow = textShadowCss(pres);

  return (
    <div
      className={`relative overflow-hidden bg-black ${
        compact ? 'aspect-[9/16] w-full' : 'aspect-[9/16] h-full max-h-full w-full max-w-[22rem]'
      }`}
    >
      <div className="absolute inset-0" style={presentationSurface(pres)}>
        {isPost && media ? (
          <img src={media} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        {!media && (
          <div
            className="relative flex h-full flex-col justify-center"
            style={{
              fontSize: compact ? 16 : Math.min(pres.fontSize, 36),
              textShadow: shadow,
              fontWeight: pres.textStyle === 'bold' ? 700 : 500,
              fontStyle: pres.textStyle === 'italic' ? 'italic' : undefined
            }}
          >
            <div className="line-clamp-[8] break-words leading-snug">{displayTitle}</div>
            {bodyHtml && bodyHtml !== `<p>${displayTitle}</p>` && (
              <div
                className="pen-rich-html mt-3 line-clamp-6 text-[0.55em] opacity-90 [&_*]:text-inherit"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
          </div>
        )}
        {media && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
        )}
      </div>

      <EngagementRail />

      <div className="pointer-events-none absolute bottom-4 left-3 right-16 z-20 text-white drop-shadow-md">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold backdrop-blur-sm">
            You
          </div>
          <div className="min-w-0 text-[13px] font-semibold">You</div>
        </div>
        <p className="mt-2 line-clamp-3 text-[13px] leading-snug text-white/95">
          {caption || displayTitle}
        </p>
      </div>
    </div>
  );
}

/** Browse feed-shaped live preview (full-bleed + right engagement rail). */
export function BrowseFeedTilePreview({
  manifest,
  sections,
  compact
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="overflow-hidden rounded-lg bg-neutral-950">
        <TileSurface manifest={manifest} sections={sections} compact />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Browse preview
        </span>
        <span className="truncate text-[11px] text-neutral-500">{manifest.templateId}</span>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <TileSurface manifest={manifest} sections={sections} />
      </div>
    </div>
  );
}
