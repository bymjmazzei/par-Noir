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
import type { PenSectionContent } from './types.js';

function starterSection(id: string): PenSectionContent {
  const section = getTemplate(id)?.seedSections?.[0];
  if (!section) throw new Error(`missing starter ${id}`);
  return section;
}

describe('curated widget starters', () => {
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
