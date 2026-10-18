import { describe, expect, it } from 'vitest';
import { partitionLayersForCompose } from './actionPartition.js';
import { buildActionOverlayAtTime, exportActionSectionForFeed } from './feedActionSection.js';
import { icsForEvent } from './icsForEvent.js';
import { emptyPenViewerState, pressPenAction } from './penActionPress.js';
import { scoreCaption } from './penViewerOverlay.js';
import type { PenPageLayer, PenSectionContent } from './types.js';

function btn(id: string, extra: Partial<PenPageLayer>): PenPageLayer {
  return { id, kind: 'interactive', x: 0, y: 0, w: 40, h: 20, zIndex: 2, ...extra };
}

describe('widget capabilities', () => {
  it('toggle reveal hides a shown target', () => {
    const target: PenPageLayer = {
      id: 't',
      kind: 'text',
      visible: false,
      x: 0,
      y: 40,
      w: 100,
      h: 20,
      zIndex: 3,
      textDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }
    };
    const layers = [btn('b', { behavior: 'widget.reveal', revealLayerId: 't', revealMode: 'toggle' }), target];
    let state = emptyPenViewerState();
    state = pressPenAction({ layers, layerId: 'b', state }).state;
    expect(state.revealed).toContain('t');
    state = pressPenAction({ layers, layerId: 'b', state }).state;
    expect(state.hidden).toContain('t');
  });

  it('step frames show one layer set at a time', () => {
    const section: PenSectionContent = {
      slug: 'p',
      doc: { type: 'doc', content: [] },
      layers: [
        btn('next', { behavior: 'widget.step', stepDir: 'next', parentGroupId: 'g' }),
        { id: 'a', kind: 'text', parentGroupId: 'g', stepFrame: 0, x: 0, y: 0, w: 10, h: 10, zIndex: 1, textDoc: { type: 'doc', content: [] } },
        { id: 'b', kind: 'text', parentGroupId: 'g', stepFrame: 1, x: 0, y: 0, w: 10, h: 10, zIndex: 2, textDoc: { type: 'doc', content: [] } },
        { id: 'g', kind: 'group', x: 0, y: 0, w: 100, h: 100, zIndex: 1 }
      ]
    };
    const exported = exportActionSectionForFeed(section);
    expect(buildActionOverlayAtTime(exported, 0, { revealed: [], hidden: [], steps: {} }).map((l) => l.id)).toContain('a');
    const stepped = pressPenAction({
      layers: section.layers!,
      layerId: 'next',
      state: emptyPenViewerState()
    }).state;
    expect(buildActionOverlayAtTime(exported, 0, stepped).map((l) => l.id)).toContain('b');
    expect(buildActionOverlayAtTime(exported, 0, stepped).map((l) => l.id)).toContain('next');
    expect(buildActionOverlayAtTime(exported, 0, { revealed: [], hidden: [], steps: {} }).map((l) => l.id)).toContain('next');
  });

  it('quiz answer and score caption', () => {
    const layers = [
      { id: 'g', kind: 'group' as const, x: 0, y: 0, w: 100, h: 100, zIndex: 1 },
      btn('yes', { behavior: 'quiz.answer', correct: true, parentGroupId: 'g', stepFrame: 0 }),
      btn('no', { behavior: 'quiz.answer', parentGroupId: 'g', stepFrame: 0 }),
      { id: 'sc', kind: 'text' as const, widgetElement: 'score', parentGroupId: 'g', x: 0, y: 60, w: 80, h: 24, zIndex: 4 }
    ];
    let state = emptyPenViewerState();
    state = pressPenAction({ layers, layerId: 'yes', state }).state;
    expect(scoreCaption(layers, state, 'g')).toBe('1 / 1');
  });

  it('page.go returns navigate and calendar builds ics', () => {
    const nav = pressPenAction({
      layers: [btn('go', { behavior: 'page.go', goTo: 'page:2' })],
      layerId: 'go',
      state: emptyPenViewerState()
    });
    expect(nav.effect).toEqual({ kind: 'navigate', goTo: 'page:2' });
    const cal = pressPenAction({
      layers: [
        btn('add', {
          behavior: 'cta.calendar',
          eventTitle: 'Launch',
          eventStart: '2026-06-01T18:00:00.000Z'
        })
      ],
      layerId: 'add',
      state: emptyPenViewerState()
    });
    expect(cal.effect.kind).toBe('calendar');
    const built = icsForEvent({
      title: 'Launch',
      startIso: '2026-06-01T18:00:00.000Z'
    });
    expect(built.ics).toContain('BEGIN:VCALENDAR');
  });

  it('score and step layers partition as action', () => {
    const { action } = partitionLayersForCompose([
      { id: 's', kind: 'text', widgetElement: 'score', x: 0, y: 0, w: 10, h: 10, zIndex: 1 },
      { id: 'f', kind: 'text', stepFrame: 0, x: 0, y: 0, w: 10, h: 10, zIndex: 2, textDoc: { type: 'doc', content: [] } }
    ]);
    expect(action.map((l) => l.id).sort()).toEqual(['f', 's']);
  });
});
