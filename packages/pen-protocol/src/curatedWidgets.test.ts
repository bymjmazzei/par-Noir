import { describe, expect, it } from 'vitest';
import { getTemplate } from './templates.js';
import { CURATED_WIDGET_IDS, voteFace } from './widgetElements.js';
import { copyWidgetLayersIntoSection } from './layers.js';
import { partitionLayersForCompose } from './actionPartition.js';
import {
  countsFromVoteMatrix,
  sheetRowsToStructure,
  structureFromLayers,
  structureToSheetRows,
  voteMatrixRow
} from './pollSheet.js';
import { CURATED_WIDGET_CATEGORIES } from './curated/index.js';
import type { PenPageLayer, PenSectionContent, PenTipTapNode } from './types.js';

function starterSection(id: string): PenSectionContent {
  const section = getTemplate(id)?.seedSections?.[0];
  if (!section) throw new Error(`missing starter ${id}`);
  return section;
}

function docText(node: PenTipTapNode | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  return (node.content || []).map(docText).join(node.type === 'doc' ? '\n' : '');
}

function layerText(layer: PenPageLayer): string {
  return (layer.label || docText(layer.textDoc)).trim();
}

function overlaps(a: PenPageLayer, b: PenPageLayer): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function sameFrame(a: PenPageLayer, b: PenPageLayer): boolean {
  return a.stepFrame == null || b.stepFrame == null || a.stepFrame === b.stepFrame;
}

describe('curated widget starters', () => {
  it('ids are unique and every starter has a category', () => {
    const ids = new Set<string>();
    for (const id of CURATED_WIDGET_IDS) {
      expect(ids.has(id)).toBe(false);
      ids.add(id);
      const t = getTemplate(id);
      expect(t?.widgetCategory).toBeTruthy();
    }
    expect(CURATED_WIDGET_IDS.length).toBe(72);
  });

  it('each starter draws HTML art and carries real action layers', () => {
    for (const id of CURATED_WIDGET_IDS) {
      const layers = starterSection(id).layers || [];
      expect(layers.some((layer) => layer.widgetElement === 'html' && layer.htmlSource)).toBe(true);
      expect(layers.some((layer) => layer.kind === 'interactive' && layer.behavior)).toBe(true);
    }
  });

  it('poll starter has options, a write-in with its input, and a countdown', () => {
    const section = starterSection('widget.poll_writein.v1');
    const layers = section.layers || [];
    expect(layers.some((layer) => layer.widgetElement === 'time' && layer.timeFace === 'countdown')).toBe(true);
    expect(layers.some((layer) => layer.widgetElement === 'input')).toBe(true);
    const structure = structureFromLayers(section);
    expect(structure.question).toBe('What should we build next?');
    expect(structure.options.filter((option) => option.writeIn)).toHaveLength(1);
    expect(structure.closesAt).toBeTruthy();
  });

  it('HTML art bakes with the inert layers', () => {
    const { inert, action } = partitionLayersForCompose(starterSection('widget.quiz.v1').layers || []);
    expect(inert.some((layer) => layer.widgetElement === 'html')).toBe(true);
    expect(action.some((layer) => layer.widgetElement === 'html')).toBe(false);
  });

  it('copying the quiz keeps Reveal pointed at the copied answer layer', () => {
    const source = starterSection('widget.quiz.v1');
    const target: PenSectionContent = { slug: 'body', doc: { type: 'doc', content: [] }, layers: [] };
    const copied = copyWidgetLayersIntoSection(target, source.layers || [], 'Quiz').section.layers || [];
    const reveal = copied.find((layer) => layer.behavior === 'widget.reveal');
    expect(reveal?.revealLayerId).toBeTruthy();
    expect(reveal?.revealLayerId).not.toBe('qz_answer');
    expect(copied.some((layer) => layer.id === reveal?.revealLayerId)).toBe(true);
  });
});

describe('curated widgets are fully set up', () => {
  const all = CURATED_WIDGET_IDS.map((id) => ({ id, template: getTemplate(id)!, layers: starterSection(id).layers || [] }));

  it('carry no placeholder copy', () => {
    const banned = [/Option [AB]\b/, /More detail lives here/i, /Back side text/i, /^Step \d+$/];
    for (const { id, layers } of all) {
      for (const layer of layers) {
        const text = layerText(layer);
        for (const re of banned) expect(re.test(text), `${id} ${layer.id}: ${text}`).toBe(false);
        if (layer.kind === 'interactive') expect(text, `${id} ${layer.id}`).not.toBe('Open');
      }
    }
  });

  it('headlines are not the template title and kickers are not the category name', () => {
    const categoryNames = new Set(CURATED_WIDGET_CATEGORIES.flatMap((c) => [c.id.toUpperCase(), c.label.toUpperCase()]));
    for (const { id, template, layers } of all) {
      for (const layer of layers.filter((l) => l.widgetElement === 'text')) {
        const text = layerText(layer);
        expect(text.toLowerCase(), `${id} ${layer.id}`).not.toBe(template.title.toLowerCase());
        expect(categoryNames.has(text.toUpperCase()), `${id} ${layer.id}: ${text}`).toBe(false);
      }
    }
  });

  it('each widget has its own art', () => {
    const seen = new Map<string, string>();
    for (const { id, layers } of all) {
      const art = layers.find((l) => l.widgetElement === 'html')!.htmlSource!;
      expect(seen.get(art), `${id} shares art with ${seen.get(art)}`).toBeUndefined();
      seen.set(art, id);
    }
  });

  it('no more than three widgets share the same behaviors and layer count', () => {
    const bySignature = new Map<string, string[]>();
    for (const { id, layers } of all) {
      const behaviors = layers.map((l) => l.behavior).filter(Boolean).sort().join(',');
      const key = `${behaviors}|${layers.length}`;
      bySignature.set(key, [...(bySignature.get(key) || []), id]);
    }
    for (const ids of bySignature.values()) expect(ids.length, ids.join(' ')).toBeLessThanOrEqual(3);
  });

  it('every layer sits inside the art frame', () => {
    for (const { id, layers } of all) {
      const art = layers.find((l) => l.widgetElement === 'html')!;
      expect([120, 360, 640]).toContain(art.h);
      for (const l of layers) {
        const inside = l.x >= 0 && l.y >= 0 && l.x + l.w <= art.w && l.y + l.h <= art.h;
        expect(inside, `${id} ${l.id} at ${l.x},${l.y} ${l.w}x${l.h}`).toBe(true);
      }
    }
  });

  it('controls visible at the same time do not overlap', () => {
    for (const { id, layers } of all) {
      const controls = layers.filter((l) => l.visible !== false && (l.kind === 'interactive' || l.widgetElement === 'input'));
      for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
          const [a, b] = [controls[i]!, controls[j]!];
          expect(sameFrame(a, b) && overlaps(a, b), `${id}: ${a.id} overlaps ${b.id}`).toBe(false);
        }
      }
    }
  });

  it('wires the actions each widget promises', () => {
    const layersOf = (short: string) => starterSection(`widget.${short}.v1`).layers || [];
    const nav = layersOf('web_nav').filter((l) => l.behavior === 'page.go');
    expect(nav.map((l) => l.goTo)).toEqual(['page:0', 'page:1', 'page:2']);

    const multi = layersOf('quiz_multi');
    for (const b of ['widget.step', 'quiz.answer', 'widget.submit'] as const) expect(multi.some((l) => l.behavior === b), b).toBe(true);
    expect(multi.some((l) => l.widgetElement === 'score')).toBe(true);

    expect(layersOf('event_savedate').some((l) => l.behavior === 'cta.calendar' && l.eventStart)).toBe(true);
    for (const short of ['web_faq', 'web_tabs']) {
      expect(layersOf(short).filter((l) => l.behavior === 'widget.reveal' && l.revealMode === 'tab').length, short).toBeGreaterThanOrEqual(3);
    }
    for (const short of ['web_gallery', 'edu_deck']) {
      expect(new Set(layersOf(short).map((l) => l.stepFrame).filter((f) => f != null)).size, short).toBeGreaterThanOrEqual(3);
    }
    expect(layersOf('poll_budget').some((l) => l.behavior === 'widget.allocate')).toBe(true);
    expect(layersOf('social_quote').some((l) => l.behavior === 'widget.submit')).toBe(false);
  });

  it('reveal targets start hidden, except one open tab per widget', () => {
    for (const { id, layers } of all) {
      let openTabs = 0;
      for (const l of layers.filter((x) => x.behavior === 'widget.reveal')) {
        const target = layers.find((x) => x.id === l.revealLayerId);
        expect(target, `${id} ${l.id}`).toBeTruthy();
        if (l.revealMode === 'tab' && target!.visible !== false) openTabs++;
        else expect(target!.visible, `${id} ${l.id}`).toBe(false);
      }
      expect(openTabs, id).toBeLessThanOrEqual(1);
    }
  });

  it('banner and story sizes match the gallery aspect', () => {
    for (const { id, template, layers } of all) {
      const h = layers.find((l) => l.widgetElement === 'html')!.h;
      const aspect = h === 640 ? '9/16' : h === 120 ? '16/9' : '1/1';
      expect(template.seedGalleryAspect, id).toBe(aspect);
    }
  });
});

describe('inserting a widget into a narrow page', () => {
  it('scales the whole widget, faces included, to the page content width', () => {
    const source = starterSection('widget.poll_writein.v1').layers || [];
    const target: PenSectionContent = { slug: 'body', doc: { type: 'doc', content: [] }, layers: [] };
    const { section, groupId } = copyWidgetLayersIntoSection(target, source, 'Poll', undefined, { maxWidth: 280 });
    const layers = section.layers || [];
    const group = layers.find((layer) => layer.id === groupId)!;
    expect(group.w).toBeCloseTo(248);
    const art = layers.find((layer) => layer.widgetElement === 'html')!;
    expect(art.w).toBeCloseTo(248);
    expect(art.contentScale).toBeCloseTo(248 / 360, 3);
    const wide = copyWidgetLayersIntoSection(target, source, 'Poll', undefined, { maxWidth: 736 });
    expect(wide.section.layers?.every((layer) => layer.contentScale == null)).toBe(true);
  });
});

describe('poll write-in', () => {
  const options = [
    { id: 'a', label: 'A' },
    { id: 'other', label: 'Other', writeIn: true }
  ];

  it('write_in rows round-trip through the structure sheet', () => {
    const structure = { question: 'Q', options, closesAt: null };
    expect(sheetRowsToStructure(structureToSheetRows(structure)).options).toEqual(options);
  });

  it('the write-in cell holds the typed answer and counts as an Other vote', () => {
    const row = voteMatrixRow({ user: 'u1', options, optionId: 'other', writeIn: '  Dark   mode ' });
    expect(row).toEqual(['u1', '', 'Dark mode']);
    const counts = countsFromVoteMatrix(options, [row, ['u2', '1', '']]);
    expect(counts.byOption).toEqual({ a: 1, other: 1 });
    expect(counts.total).toBe(2);
  });

  it('option buttons keep their labels until the viewer votes in an open poll', () => {
    const closesAt = '2026-06-01T00:00:00.000Z';
    const now = Date.parse('2026-05-01T00:00:00.000Z');
    const base = { optionId: 'a', label: 'A', counts: null, correctOptionId: null, closesAt, now };
    expect(voteFace({ ...base, votedOptionId: null })).toEqual({ kind: 'label', text: 'A' });
    expect(voteFace({ ...base, votedOptionId: 'a' }).kind).toBe('countdown');
  });
});
