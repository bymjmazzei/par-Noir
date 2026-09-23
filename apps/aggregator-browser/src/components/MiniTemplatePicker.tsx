/**
 * Pen Mini curated picker: blank + up to 3 browseFeatured per social form + starred/created.
 */
import { useMemo, useState } from 'react';
import {
  blankTemplateForClass,
  docToPlainText,
  listBrowseFeaturedTemplates,
  type PenTemplate
} from '@par-noir/pen-protocol';
import { useUserState } from '../contexts/UserStateContext';

const SOCIAL_NOTE_CLASS = 'social.note';
const FEATURED_CAP = 3;

export type MiniPickerChoice = {
  id: string;
  title: string;
  seedText: string;
};

function seedTextFromTemplate(t: PenTemplate): string {
  const first = t.seedSections?.[0];
  if (!first) return '';
  return docToPlainText(first.doc).trim();
}

function loadYoursLocal(pn: string | undefined): MiniPickerChoice[] {
  if (!pn || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(`pen_personal_templates_v1:${pn}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as Array<{
      id: string;
      title: string;
      classId: string;
      seedSections?: Array<{ doc?: unknown }>;
    }>;
    return list
      .filter((t) => t.classId === SOCIAL_NOTE_CLASS || t.classId?.startsWith('social.'))
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        title: t.title || 'Yours',
        seedText:
          t.seedSections?.[0] && typeof t.seedSections[0] === 'object'
            ? docToPlainText(t.seedSections[0].doc as never).trim()
            : ''
      }));
  } catch {
    return [];
  }
}

export function MiniTemplatePicker({
  selectedId,
  onSelect
}: {
  selectedId: string;
  onSelect: (choice: MiniPickerChoice) => void;
}) {
  const { userState } = useUserState();
  const pn = userState.isUnlocked ? userState.pnIdentifier : undefined;
  const [open, setOpen] = useState(false);

  const choices = useMemo(() => {
    const blank = blankTemplateForClass(SOCIAL_NOTE_CLASS);
    const featured = listBrowseFeaturedTemplates(SOCIAL_NOTE_CLASS).slice(0, FEATURED_CAP);
    const yours = loadYoursLocal(pn);
    const out: MiniPickerChoice[] = [];
    if (blank) {
      out.push({
        id: blank.id,
        title: blank.title,
        seedText: seedTextFromTemplate(blank)
      });
    }
    for (const t of featured) {
      out.push({ id: t.id, title: t.title, seedText: seedTextFromTemplate(t) });
    }
    out.push(...yours);
    return out;
  }, [pn]);

  const selected = choices.find((c) => c.id === selectedId) || choices[0];

  return (
    <div className="absolute left-3 top-3 z-40">
      <button
        type="button"
        className="rounded-md bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {selected?.title || 'Template'} ▾
      </button>
      {open && (
        <div className="mt-1 max-h-56 min-w-[11rem] overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 py-1 shadow-lg">
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`block w-full px-3 py-1.5 text-left text-[11px] hover:bg-neutral-800 ${
                c.id === selected?.id ? 'text-white' : 'text-neutral-300'
              }`}
              onClick={() => {
                onSelect(c);
                setOpen(false);
              }}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
