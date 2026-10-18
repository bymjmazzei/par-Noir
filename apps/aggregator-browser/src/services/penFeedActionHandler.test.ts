import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ownerFetch = vi.fn();
vi.mock('./ownerApiFetch', () => ({
  ownerFetch: (...args: unknown[]) => ownerFetch(...args)
}));

import { runFeedPenEffect } from './penFeedActionHandler';

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

  it('skips sheet rows for a viewer who is not unlocked', async () => {
    await runFeedPenEffect({
      effect: { kind: 'widget_row', spreadsheetId: 'sheet-1', row },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner'
    });
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('posts sheet rows to the widget action endpoint', async () => {
    await runFeedPenEffect({
      effect: { kind: 'widget_row', spreadsheetId: 'sheet-1', row },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch).toHaveBeenCalledWith(
      'POST',
      '/api/pen/widgets/action',
      { userPnIdentifier: 'viewer', ownerPnIdentifier: 'owner', spreadsheetId: 'sheet-1', docId: 'doc-1', row },
      { pnIdentifier: 'viewer' }
    );
  });

  it('posts votes to the poll endpoint', async () => {
    await runFeedPenEffect({
      effect: { kind: 'vote', layerId: 'b', optionId: 'opt', spreadsheetId: 'sheet-1' },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch.mock.calls[0][1]).toBe('/api/pen/polls/vote');
    expect(ownerFetch.mock.calls[0][2]).toMatchObject({ pollId: 'sheet-1', optionId: 'opt' });
    expect(ownerFetch.mock.calls[0][2]).not.toHaveProperty('writeIn');
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
      effect: { kind: 'vote', layerId: 'b', optionId: 'other', spreadsheetId: 'sheet-1', writeIn: 'Dark mode' },
      penDocId: 'doc-1',
      creatorPnIdentifier: 'owner',
      userPnIdentifier: 'viewer'
    });
    expect(ownerFetch.mock.calls[0][2]).toMatchObject({ optionId: 'other', writeIn: 'Dark mode' });
  });
});
