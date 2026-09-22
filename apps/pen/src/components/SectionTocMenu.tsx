import { useEffect, useRef, useState } from 'react';

export interface SectionTocItem {
  slug: string;
  title: string;
  required?: boolean;
}

/** Closed = current section; open = full TOC dropdown. */
export function SectionTocMenu({
  sections,
  activeSlug,
  onSelect
}: {
  sections: SectionTocItem[];
  activeSlug: string;
  onSelect: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = sections.find((s) => s.slug === activeSlug) || sections[0];
  const label = active?.title || activeSlug;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium text-stone-800 hover:bg-stone-50"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-[10px] text-stone-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] max-w-[18rem] overflow-hidden rounded-md border border-stone-200 bg-white py-1 shadow-lg">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
            Sections
          </div>
          {sections.map((s) => (
            <button
              key={s.slug}
              type="button"
              className={`flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px] ${
                s.slug === activeSlug
                  ? 'bg-sky-50 font-medium text-sky-950'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
              onClick={() => {
                onSelect(s.slug);
                setOpen(false);
              }}
            >
              <span className="truncate">{s.title}</span>
              {s.required === false && (
                <span className="shrink-0 text-[10px] text-stone-400">opt</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
