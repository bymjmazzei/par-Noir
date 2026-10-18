import { describe, expect, it } from 'vitest';
import {
  encodeWidgetId,
  parseWidgetId,
  pollResultsFromCounts,
  widgetViewPhase
} from './widgetView.js';

describe('widgetView', () => {
  it('round-trips widget ids', () => {
    const id = encodeWidgetId('doc-1', 'group-a');
    expect(parseWidgetId(id)).toEqual({ docId: 'doc-1', groupLayerId: 'group-a' });
  });

  it('assigns view phases', () => {
    expect(
      widgetViewPhase({
        unlocked: false,
        ownerPnHash: 'owner',
        revealPolicy: 'after_response',
        closesAt: null,
        hasResponded: false
      })
    ).toBe('locked');

    expect(
      widgetViewPhase({
        unlocked: true,
        viewerActorHash: 'owner',
        ownerPnHash: 'owner',
        revealPolicy: 'after_response',
        closesAt: null,
        hasResponded: false
      })
    ).toBe('owner');

    expect(
      widgetViewPhase({
        unlocked: true,
        viewerActorHash: 'voter',
        ownerPnHash: 'owner',
        revealPolicy: 'after_response',
        closesAt: null,
        hasResponded: false
      })
    ).toBe('ballot');

    expect(
      widgetViewPhase({
        unlocked: true,
        viewerActorHash: 'voter',
        ownerPnHash: 'owner',
        revealPolicy: 'after_response',
        closesAt: null,
        hasResponded: true
      })
    ).toBe('results');

    expect(
      widgetViewPhase({
        unlocked: true,
        viewerActorHash: 'voter',
        ownerPnHash: 'owner',
        revealPolicy: 'at_close',
        closesAt: '2099-01-01T00:00:00.000Z',
        hasResponded: true
      })
    ).toBe('waiting');

    expect(
      widgetViewPhase({
        unlocked: true,
        viewerActorHash: 'voter',
        ownerPnHash: 'owner',
        revealPolicy: 'creator_only',
        closesAt: null,
        hasResponded: true
      })
    ).toBe('waiting');
  });

  it('builds poll result lines', () => {
    const results = pollResultsFromCounts(
      {
        question: 'Q',
        options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
        closesAt: null
      },
      { total: 3, byOption: { a: 2, b: 1 } }
    );
    expect(results).toMatchObject({
      kind: 'poll',
      total: 3,
      options: [
        { optionId: 'a', count: 2, percent: 67 },
        { optionId: 'b', count: 1, percent: 33 }
      ]
    });
  });
});
