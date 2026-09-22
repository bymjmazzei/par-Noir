import React, { useMemo, useState } from 'react';
import {
  getTemplate,
  type PenDocManifest,
  type PenFlowBlock,
  type PenSectionContent
} from '@par-noir/pen-protocol';

function blocksToHtmlish(blocks: PenFlowBlock[]): React.ReactNode[] {
  return blocks.map((b, i) => {
    if (b.type === 'image' && b.ref) {
      const src = b.ref;
      const looksUrl = /^https?:\/\//i.test(src) || src.startsWith('data:');
      return (
        <figure key={b.id || i} className="my-3">
          {looksUrl ? (
            <img src={src} alt={b.text || ''} className="max-h-64 w-full rounded-lg object-cover" />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg bg-stone-200 text-xs text-stone-500">
              {src || 'image'}
            </div>
          )}
        </figure>
      );
    }
    if (b.type === 'heading') {
      const Tag = b.level === 2 ? 'h3' : 'h2';
      return (
        <Tag key={b.id || i} className={b.level === 2 ? 'mt-3 text-lg font-semibold' : 'mt-2 text-xl font-semibold'}>
          {renderMarks(b.text || '')}
        </Tag>
      );
    }
    if (b.type === 'quote') {
      return (
        <blockquote key={b.id || i} className="my-2 border-l-2 border-stone-300 pl-3 italic text-stone-600">
          {renderMarks(b.text || '')}
        </blockquote>
      );
    }
    if (b.type === 'list') {
      const lines = (b.text || '').split('\n').filter(Boolean);
      return (
        <ul key={b.id || i} className="my-2 list-disc space-y-1 pl-5">
          {lines.map((line, j) => (
            <li key={j}>{renderMarks(line.replace(/^•\s*/, ''))}</li>
          ))}
        </ul>
      );
    }
    const t = b.text || '';
    if (!t.trim()) return <p key={b.id || i} className="h-4" />;
    return (
      <p key={b.id || i} className="my-1.5 leading-relaxed">
        {renderMarks(t)}
      </p>
    );
  });
}

function renderMarks(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0]!;
    if (raw.startsWith('**')) {
      parts.push(<strong key={i++}>{raw.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={i++}>{raw.slice(1, -1)}</em>);
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

function sectionMap(sections: PenSectionContent[]): Map<string, PenSectionContent> {
  return new Map(sections.map((s) => [s.slug, s]));
}

function NotePreview({
  title,
  sections,
  templateId
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
}) {
  const template = getTemplate(templateId);
  const bySlug = sectionMap(sections);
  const titleSec = bySlug.get('title');
  const bodySec = bySlug.get('body') || sections[0];
  const displayTitle =
    (titleSec?.blocks.map((b) => b.text).join(' ') || '').trim() || title || 'Untitled';

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
        <div className="border-b border-stone-100 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-700">Note</div>
          <h2 className="mt-1 font-serif text-xl font-semibold leading-snug text-stone-900">
            {displayTitle}
          </h2>
          <p className="mt-0.5 text-[11px] text-stone-400">{template?.title || templateId}</p>
        </div>
        <div className="max-h-[28rem] space-y-1 overflow-y-auto px-4 py-4 text-[15px] text-stone-800">
          {template?.sections
            .filter((s) => s.slug !== 'title')
            .map((s) => {
              const sec = bySlug.get(s.slug);
              if (!sec) return null;
              return (
                <div key={s.slug} className="mb-4">
                  {template.sections.length > 2 && (
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-stone-400">
                      {s.title}
                    </div>
                  )}
                  {blocksToHtmlish(sec.blocks)}
                </div>
              );
            }) || blocksToHtmlish(bodySec?.blocks || [])}
        </div>
      </div>
    </div>
  );
}

function PostPreview({
  title,
  sections,
  templateId
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
}) {
  const bySlug = sectionMap(sections);
  const mediaFirst = templateId.includes('media');
  const caption = bySlug.get('caption');
  const attachments = bySlug.get('attachments');
  const mediaBlocks = (attachments?.blocks || []).filter((b) => b.type === 'image' || b.ref);
  const textBlocks = (caption?.blocks || []).filter((b) => b.type !== 'image');

  const frame = (
    <>
      <div className="aspect-[4/5] bg-stone-900">
        {mediaBlocks.length ? (
          blocksToHtmlish(mediaBlocks.slice(0, 1)).map((n, i) => (
            <div key={i} className="flex h-full items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-cover [&_figure]:m-0 [&_figure]:h-full">
              {n}
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">
            Add media in Attachments
          </div>
        )}
      </div>
      <div className="space-y-1 px-3 py-3 text-sm text-stone-800">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Post</div>
        <div className="font-medium">{title || 'Untitled'}</div>
        {blocksToHtmlish(textBlocks)}
      </div>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-[20rem] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
      {mediaFirst ? frame : (
        <>
          <div className="space-y-1 px-3 py-3 text-sm">{blocksToHtmlish(textBlocks)}</div>
          <div className="aspect-[4/5] bg-stone-100">
            {mediaBlocks.length ? (
              blocksToHtmlish(mediaBlocks.slice(0, 1))
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-stone-400">Media</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CollectionPreview({
  title,
  sections,
  templateId
}: {
  title: string;
  sections: PenSectionContent[];
  templateId: string;
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
    <div className="mx-auto w-full max-w-[18rem]">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg">
        <div className="flex aspect-[9/16] flex-col bg-gradient-to-b from-stone-900 to-stone-800 text-white">
          <div className="flex gap-1 px-3 pt-3">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 rounded-full ${i === idx ? 'bg-white' : 'bg-white/30'}`}
              />
            ))}
          </div>
          <div className="flex flex-1 flex-col justify-end p-5">
            <div className="text-[10px] uppercase tracking-wider text-white/50">
              {cur?.title || 'Slide'} · Collection
            </div>
            <div className="mt-2 font-serif text-2xl font-semibold leading-tight">
              {title || 'Untitled'}
            </div>
            <div className="mt-3 max-h-40 overflow-y-auto text-sm text-white/90 [&_blockquote]:border-white/40 [&_p]:text-white/90">
              {cur?.section ? blocksToHtmlish(cur.section.blocks) : null}
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
      </div>
    </div>
  );
}

function FeedPreview({
  title,
  sections
}: {
  title: string;
  sections: PenSectionContent[];
}) {
  const bySlug = sectionMap(sections);
  const meta = bySlug.get('meta');
  const rules = bySlug.get('rules') || bySlug.get('index');

  return (
    <div className="mx-auto w-full max-w-[24rem] overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
      <div className="bg-stone-900 px-4 py-5 text-white">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-300">
          Self-hosted feed
        </div>
        <h2 className="mt-1 text-xl font-semibold">{title || 'Untitled feed'}</h2>
      </div>
      <div className="space-y-4 px-4 py-4 text-sm text-stone-800">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-stone-400">Meta</div>
          {meta ? blocksToHtmlish(meta.blocks) : <p className="text-stone-400">—</p>}
        </div>
        {rules && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">Rules / Index</div>
            {blocksToHtmlish(rules.blocks)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Live compile target — what the template will look like when published. */
export function TemplateLivePreview({
  manifest,
  sections
}: {
  manifest: PenDocManifest;
  sections: PenSectionContent[];
}) {
  const docType = manifest.docType;
  const body = useMemo(() => {
    if (docType === 'post') {
      return (
        <PostPreview title={manifest.title} sections={sections} templateId={manifest.templateId} />
      );
    }
    if (docType === 'collection') {
      return (
        <CollectionPreview
          title={manifest.title}
          sections={sections}
          templateId={manifest.templateId}
        />
      );
    }
    if (docType === 'self_hosted_feed') {
      return <FeedPreview title={manifest.title} sections={sections} />;
    }
    return (
      <NotePreview title={manifest.title} sections={sections} templateId={manifest.templateId} />
    );
  }, [docType, manifest.title, manifest.templateId, sections]);

  return (
    <div className="flex h-full flex-col bg-stone-200/90">
      <div className="flex shrink-0 items-center justify-between border-b border-stone-300 bg-stone-100 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          Live preview
        </span>
        <span className="truncate text-[11px] text-stone-400">{manifest.templateId}</span>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6">{body}</div>
    </div>
  );
}
