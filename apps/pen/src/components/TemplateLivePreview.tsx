import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  defaultPagePresentation,
  docToHtml,
  docToPlainText,
  getTemplate,
  mergePagePresentation,
  normalizeSection,
  type PenDocManifest,
  type PenPagePresentation,
  type PenSectionContent,
  type PenTipTapNode
} from '@par-noir/pen-protocol';

function RichHtml({ doc, className }: { doc?: PenTipTapNode; className?: string }) {
  const html = docToHtml(doc);
  if (!html.trim()) return <p className="h-4 text-stone-400"> </p>;
  return (
    <div
      className={`pen-rich-html ${className || ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function sectionBody(sec: PenSectionContent | undefined) {
  if (!sec) return null;
  return <RichHtml doc={normalizeSection(sec).doc} />;
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

function sectionMap(sections: PenSectionContent[]): Map<string, PenSectionContent> {
  return new Map(
    sections.map((s) => {
      const n = normalizeSection(s);
      return [n.slug, n];
    })
  );
}

function presentationCardStyle(pres: PenPagePresentation): CSSProperties {
  return {
    backgroundColor: pres.backgroundColor,
    backgroundImage: pres.backgroundImage ? `url(${pres.backgroundImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: pres.textColor,
    fontFamily: pres.fontFamily,
    textAlign: pres.textAlign,
    padding: `${Math.min(pres.padding, 24)}px`,
    boxShadow: `${pres.dropShadowOffsetX}px ${pres.dropShadowOffsetY}px ${pres.dropShadowBlur}px ${pres.dropShadowColor}`
  };
}

/** Fixed browse engagement chrome (visual only in Pen). */
function EngagementBar() {
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-stone-200/80 bg-white/95 px-3 py-2 text-stone-600">
      <span className="inline-flex items-center gap-1 text-[12px]" title="Like">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M7 11v10M15 11l2-6a2 2 0 0 0-2-2h-3l-1 4H7v4h8z" />
        </svg>
        0
      </span>
      <span className="inline-flex items-center gap-1 text-[12px]" title="Comment">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
        </svg>
        0
      </span>
      <span className="inline-flex items-center gap-1 text-[12px]" title="Share">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        0
      </span>
      <span className="ml-auto inline-flex items-center gap-1 text-[12px]" title="Save">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </span>
    </div>
  );
}

function AuthorRow({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 text-[11px] font-semibold text-white">
        pN
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-stone-900">{title || 'Untitled'}</div>
        <div className="text-[11px] text-stone-400">Browse preview</div>
      </div>
    </div>
  );
}

function BrowseCard({
  children,
  title,
  caption,
  pres
}: {
  children: ReactNode;
  title: string;
  caption?: ReactNode;
  pres: PenPagePresentation;
}) {
  return (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
      <AuthorRow title={title} />
      <div style={presentationCardStyle(pres)} className="min-h-[8rem]">
        {children}
      </div>
      {caption ? (
        <div className="space-y-1 border-t border-stone-100 px-3 py-3 text-[14px] text-stone-800">
          <div className="text-[12px] font-semibold text-stone-900">{title}</div>
          <div className="text-stone-700">{caption}</div>
        </div>
      ) : null}
      <EngagementBar />
    </div>
  );
}

function NotePreview({
  title,
  sections,
  templateId,
  pres
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
  pres: PenPagePresentation;
}) {
  const template = getTemplate(templateId);
  const bySlug = sectionMap(sections);
  const titleSec = bySlug.get('title');
  const bodySec = bySlug.get('body') || sections[0];
  const displayTitle =
    (titleSec ? docToPlainText(titleSec.doc) : '').trim() || title || 'Untitled';
  const caption = (
    <div className="space-y-2 text-[14px] leading-relaxed">
      {template?.sections
        .filter((s) => s.slug !== 'title')
        .map((s) => {
          const sec = bySlug.get(s.slug);
          if (!sec) return null;
          return <div key={s.slug}>{sectionBody(sec)}</div>;
        }) || sectionBody(bodySec)}
    </div>
  );

  return (
    <BrowseCard title={displayTitle} caption={caption} pres={pres}>
      <div
        className="px-1 py-6 text-center text-lg font-semibold leading-snug"
        style={{ fontSize: Math.min(pres.fontSize, 28), color: pres.textColor }}
      >
        {displayTitle}
      </div>
    </BrowseCard>
  );
}

function PostPreview({
  title,
  sections,
  templateId,
  pres
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
  pres: PenPagePresentation;
}) {
  const bySlug = sectionMap(sections);
  const mediaFirst = templateId.includes('media');
  const caption = bySlug.get('caption');
  const attachments = bySlug.get('attachments');
  const mediaSrc = firstImageSrc(attachments?.doc);
  const looksUrl = mediaSrc && (/^https?:\/\//i.test(mediaSrc) || mediaSrc.startsWith('data:'));

  const mediaPane = (
    <div className="-mx-1 aspect-[4/5] overflow-hidden rounded-lg bg-black/40">
      {looksUrl ? (
        <img src={mediaSrc!} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-sm opacity-70">Add media</div>
      )}
    </div>
  );

  const captionNode = sectionBody(caption);

  if (mediaFirst) {
    return (
      <BrowseCard title={title || 'Untitled'} caption={captionNode} pres={pres}>
        {mediaPane}
      </BrowseCard>
    );
  }
  return (
    <BrowseCard title={title || 'Untitled'} caption={captionNode} pres={pres}>
      <div className="space-y-3">
        {captionNode}
        {mediaPane}
      </div>
    </BrowseCard>
  );
}

function CollectionPreview({
  title,
  sections,
  templateId,
  pres
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
  pres: PenPagePresentation;
}) {
  const template = getTemplate(templateId);
  const bySlug = sectionMap(sections);
  const slides = (template?.sections || []).map((s) => ({
    slug: s.slug,
    title: s.title,
    section: bySlug.get(s.slug)
  }));
  const [idx, setIdx] = useState(0);
  const cur = slides[idx] || slides[0];

  return (
    <div className="mx-auto w-full max-w-[18rem] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
      <AuthorRow title={title || 'Untitled'} />
      <div className="flex aspect-[9/16] flex-col" style={presentationCardStyle(pres)}>
        <div className="flex gap-1 px-1 pt-1">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full ${i === idx ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
        <div className="flex flex-1 flex-col justify-end p-2">
          <div className="text-[10px] uppercase tracking-wider opacity-60">
            {cur?.title || 'Slide'} · Collection
          </div>
          <div className="mt-2 font-serif text-xl font-semibold leading-tight">{title || 'Untitled'}</div>
          <div className="mt-2 max-h-36 overflow-y-auto text-sm opacity-90">
            {cur?.section ? sectionBody(cur.section) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2">
        <button
          type="button"
          className="text-xs text-stone-600 disabled:opacity-30"
          disabled={idx <= 0}
          onClick={() => setIdx((v) => Math.max(0, v - 1))}
        >
          Prev
        </button>
        <span className="text-[11px] text-stone-400">
          {idx + 1} / {slides.length}
        </span>
        <button
          type="button"
          className="text-xs text-stone-600 disabled:opacity-30"
          disabled={idx >= slides.length - 1}
          onClick={() => setIdx((v) => Math.min(slides.length - 1, v + 1))}
        >
          Next
        </button>
      </div>
      <EngagementBar />
    </div>
  );
}

function FeedPreview({
  title,
  sections,
  pres
}: {
  title: string;
  sections: PenSectionContent[];
  pres: PenPagePresentation;
}) {
  const bySlug = sectionMap(sections);
  const meta = bySlug.get('meta');
  const rules = bySlug.get('rules') || bySlug.get('index');

  return (
    <BrowseCard
      title={title || 'Untitled feed'}
      caption={
        <div className="space-y-3 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">Meta</div>
            {meta ? sectionBody(meta) : <p className="text-stone-400">—</p>}
          </div>
          {rules && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-stone-400">Rules / Index</div>
              {sectionBody(rules)}
            </div>
          )}
        </div>
      }
      pres={pres}
    >
      <div className="py-4 text-center text-lg font-semibold">{title || 'Untitled feed'}</div>
    </BrowseCard>
  );
}

/** Live compile target — browse-shaped card for Social templates. */
export function TemplateLivePreview({
  manifest,
  sections,
  compact
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
  /** Home gallery / dashboard mini card. */
  compact?: boolean;
}) {
  const docType = manifest.docType;
  const pres = mergePagePresentation(
    defaultPagePresentation(),
    manifest.pagePresentation || undefined
  );
  const body = useMemo(() => {
    if (docType === 'post') {
      return (
        <PostPreview
          title={manifest.title}
          sections={sections}
          templateId={manifest.templateId}
          pres={pres}
        />
      );
    }
    if (docType === 'collection') {
      return (
        <CollectionPreview
          title={manifest.title}
          sections={sections}
          templateId={manifest.templateId}
          pres={pres}
        />
      );
    }
    if (docType === 'self_hosted_feed') {
      return <FeedPreview title={manifest.title} sections={sections} pres={pres} />;
    }
    return (
      <NotePreview
        title={manifest.title}
        sections={sections}
        templateId={manifest.templateId}
        pres={pres}
      />
    );
  }, [docType, manifest.title, manifest.templateId, sections, pres]);

  if (compact) {
    return <div className="pointer-events-none origin-top scale-[0.72]">{body}</div>;
  }

  return (
    <div className="flex h-full flex-col bg-stone-200/90">
      <div className="flex shrink-0 items-center justify-between border-b border-stone-300 bg-stone-100 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Browse preview
        </span>
        <span className="truncate text-[11px] text-stone-400">{manifest.templateId}</span>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6">{body}</div>
    </div>
  );
}
