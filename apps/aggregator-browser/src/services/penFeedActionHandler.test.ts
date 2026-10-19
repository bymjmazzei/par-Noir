import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ownerFetch = vi.fn();
vi.mock('./ownerApiFetch', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args)
}));

import { runFeedPenEffect, sendPenTap } from './penFeedActionHandler';

const row = {
  actionId: 'a1',
  trigger: 'widget.toggle' as const,
  actorId: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  present: true
};

describe('runFeedPenEffect', () => {
  const open = vi.fn();
  const assign = vi.fn();

  beforeEach(() => {
    ownerFetch.mockReset();
    ownerFetch.mockResolvedValue(new Response('{}'));
    open.mockReset();
    assign.mockReset();
    vi.stubGlobal('window', { open, location: { assign } });
    vi.stubGlobal('crypto', { randomUUID: () => 'vote-uuid' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a link without an unlocked viewer', async () => {
    await runFeedPenEffect({ effect: { kind: 'open', url: 'https://example.com/', host: 'example.com', warnings: [] } });
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('assigns mailto and opens a Messaging handoff', async () => {
    await runFeedPenEffect({ effect: { kind: 'mailto', href: 'mailto:a%40b.com', to: 'a@b.com' } });
    expect(assign).toHaveBeenCalledWith('mailto:a%40b.com');
    await runFeedPenEffect({
      effect: { kind: 'messaging', title: 'Send', body: 'Email: x', to: '' },
      penDocId: 'doc-1'
    });
    const url = String(open.mock.calls[0][0]);
    expect(url).toContain('#pen_correspondence_handoff_v1:');
    expect(decodeURIComponent(url)).toContain('"docId":"doc-1"');
  });

  it('skips respond for a viewer who is not unlocked', async () => {
    await runFeedPenEffect({
      effect: { kind: 'widget_row', widgetId: 'doc-1:g', row },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner'
    });
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('posts sheet rows to the widget respond endpoint', async () => {
    await runFeedPenEffect({
      effect: { kind: 'widget_row', widgetId: 'doc-1:g', row },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch).toHaveBeenCalledWith(
      'POST',
      '/api/pen/widgets/respond',
      expect.objectContaining({
        userPnIdentifier: 'viewer',
        ownerPnIdentifier: 'owner',
        widgetId: 'doc-1:g',
        respondKind: 'widget_row',
        row
      }),
      { pnIdentifier: 'viewer' }
    );
  });

  it('posts votes to the widget respond endpoint', async () => {
    await runFeedPenEffect({
      effect: { kind: 'vote', layerId: 'b', optionId: 'opt', widgetId: 'doc-1:g' },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch.mock.calls[0][1]).toBe('/api/pen/widgets/respond');
    expect(ownerFetch.mock.calls[0][2]).toMatchObject({
      widgetId: 'doc-1:g',
      optionId: 'opt',
      respondKind: 'vote'
    });
  });

  it('downloads calendar ics without unlock', async () => {
    const feedTile = await import('@par-noir/feed-tile');
    const save = vi.spyOn(feedTile, 'saveIcsFile').mockImplementation(() => undefined);
    await runFeedPenEffect({
      effect: {
        kind: 'calendar',
        ics: 'BEGIN:VCALENDAR',
        filename: 'event.ics'
      }
    });
    expect(save).toHaveBeenCalledWith({
      kind: 'calendar',
      ics: 'BEGIN:VCALENDAR',
      filename: 'event.ics'
    });
    save.mockRestore();
  });

  it('forwards a write-in answer with the vote', async () => {
    await runFeedPenEffect({
      effect: { kind: 'vote', layerId: 'b', optionId: 'other', widgetId: 'doc-1:g', writeIn: 'Dark mode' },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch.mock.calls[0][2]).toMatchObject({ optionId: 'other', writeIn: 'Dark mode' });
  });
});

describe('sendPenTap', () => {
  const tapRow = {
    actionId: 'tap-1',
    trigger: 'widget.tap' as const,
    actorId: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    headers: ['button', 'action', 'target'],
    cells: ['Shop', 'open', 'shop.example']
  };

  beforeEach(() => {
    ownerFetch.mockReset();
    ownerFetch.mockResolvedValue(new Response('{}'));
  });

  it('sends a locked viewer tap anonymously, with no pn', async () => {
    await sendPenTap({ track: { widgetId: 'doc-1:taps', row: tapRow }, creatorPnIdentifier: 'owner' });
    expect(ownerFetch).toHaveBeenCalledWith(
      'POST',
      '/api/pen/widgets/tap',
      { ownerPnIdentifier: 'owner', widgetId: 'doc-1:taps', row: tapRow },
      undefined
    );
  });

  it('stamps an unlocked viewer, and skips posts with no doc or creator', async () => {
    await sendPenTap({ track: { widgetId: 'doc-1:taps', row: tapRow }, creatorPnIdentifier: 'owner', userPnIdentifier: 'viewer' });
    expect(ownerFetch.mock.calls[0][2]).toMatchObject({ userPnIdentifier: 'viewer' });
    expect(ownerFetch.mock.calls[0][3]).toEqual({ pnIdentifier: 'viewer' });
    ownerFetch.mockClear();
    await sendPenTap({ track: { row: tapRow }, creatorPnIdentifier: 'owner' });
    await sendPenTap({ track: { widgetId: 'doc-1:taps', row: tapRow } });
    expect(ownerFetch).not.toHaveBeenCalled();
  });
});
