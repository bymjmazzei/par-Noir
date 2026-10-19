import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTemplate } from '@par-noir/pen-protocol';
import {
  isStarterMirror,
  listPersonalTemplates,
  purgeStarterMirrors,
  type PersonalTemplate
} from './penPersonalTemplates';
import { mergePrefsBlob, type PenPrefsBlob } from './penPrefsCloud';

const pn = 'pn-owner';

function row(id: string, basedOn: string, title: string, extra?: Partial<PersonalTemplate>): PersonalTemplate {
  return {
    id,
    title,
    classId: getTemplate(basedOn)?.classId || 'social.note',
    docType: getTemplate(basedOn)?.docType || 'note',
    basedOnTemplateId: basedOn,
    version: '1',
    sections: [{ slug: 'card', title: 'Card', required: true }],
    seedSections: [],
    createdAt: '2026-10-18T15:07:00.000Z',
    ...extra
  };
}

const mirror = row('personal_mirror1', 'widget.social_milestone.v1', 'Milestone');
const saved = row('personal_saved1', 'widget.social_milestone.v1', 'Launch day');
const savedWithStill = row('personal_saved2', 'note.basic.portrait.v1', 'Note (Portrait)', {
  galleryPreviewRef: 'penmedia:still'
});

function blob(list: PersonalTemplate[]): PenPrefsBlob {
  return { v: 1, personalTemplates: list, pinnedCategoryIds: [], updatedAt: '2026-10-19T00:00:00.000Z' };
}

describe('starter mirror purge', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear()
    });
  });

  it('flags only frozen starter copies', () => {
    expect(isStarterMirror(mirror)).toBe(true);
    expect(isStarterMirror(saved)).toBe(false);
    expect(isStarterMirror(savedWithStill)).toBe(false);
    expect(isStarterMirror(row('personal_blank', 'blank.social.note', 'Blank'))).toBe(false);
  });

  it('drops mirror rows from local storage and keeps saved templates', () => {
    localStorage.setItem(
      `pen_personal_templates_v1:${pn}`,
      JSON.stringify([mirror, saved, savedWithStill])
    );
    expect(purgeStarterMirrors(pn)).toBe(1);
    expect(listPersonalTemplates(pn).map((t) => t.id)).toEqual([saved.id, savedWithStill.id]);
    expect(purgeStarterMirrors(pn)).toBe(0);
  });

  it('cloud merge never brings mirror rows back', () => {
    const merged = mergePrefsBlob(blob([saved]), blob([mirror, savedWithStill]));
    expect(merged.personalTemplates.map((t) => t.id).sort()).toEqual(
      [saved.id, savedWithStill.id].sort()
    );
  });
});
