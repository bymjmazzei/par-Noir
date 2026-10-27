import { describe, expect, it } from 'vitest';
import { emptyPenViewerState, pressPenAction, type PenViewerState } from './penActionPress.js';
import { buildActionOverlayAtTime, exportActionSectionForFeed } from './feedActionSection.js';
import type { PenPageLayer } from './types.js';

function button(id: string, extra: Partial<PenPageLayer>): PenPageLayer {
  return { id, kind: 'interactive', x: 0, y: 0, w: 40, h: 20, zIndex: 2, ...extra };
}

const group: PenPageLayer = {
  id: 'g',
  kind: 'group',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  zIndex: 1,
  spreadsheetId: 'sheet-1'
};

function press(layers: PenPageLayer[], layerId: string, state: PenViewerState = emptyPenViewerState()) {
  return pressPenAction({ layers, layerId, state, actorId: 'actor', docId: 'doc-1' });
}

describe('pressPenAction', () => {
  it('cta.open opens checked https links only', () => {
    const ok = press([button('b', { behavior: 'cta.open', openUrl: 'https://example.com' })], 'b');
    expect(ok.effect).toEqual({ kind: 'open', url: 'https://example.com/', host: 'example.com', warnings: [] });
    const bad = press([button('b', { behavior: 'cta.open', openUrl: 'javascript:alert(1)' })], 'b');
    expect(bad.effect.kind).toBe('none');
    const http = press([button('b', { behavior: 'cta.open', openUrl: 'http://example.com' })], 'b');
    expect(http.effect.kind).toBe('none');
    const lure = press(
      [button('b', { behavior: 'cta.open', openUrl: 'https://evil.example', label: 'Log in to par Noir' })],
      'b'
    );
    expect(lure.effect).toMatchObject({ kind: 'open', warnings: ['label_mismatch'] });
    const face = press(
      [
        button('b', {
          behavior: 'cta.open',
          openUrl: 'https://evil.example',
          textDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'paypal.com' }] }] }
        })
      ],
      'b'
    );
    expect(face.effect).toMatchObject({ kind: 'open', warnings: ['label_mismatch'] });
    const empty = press([button('b', { behavior: 'cta.open' })], 'b');
    expect(empty.effect.kind).toBe('none');
  });

  it('open, go-to-page, and calendar presses carry a tap row for the doc Taps widget', () => {
    const textDoc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    const open = press([button('b', { behavior: 'cta.open', openUrl: 'https://shop.example/x', textDoc: textDoc('Shop') })], 'b');
    expect(open.track?.widgetId).toBe('doc-1:taps');
    expect(open.track?.row).toMatchObject({
      trigger: 'widget.tap',
      actorId: 'actor',
      headers: ['button', 'action', 'target'],
      cells: ['Shop', 'open', 'shop.example']
    });
    const go = press([button('b', { behavior: 'page.go', goTo: 'slug:menu', label: 'Back' })], 'b');
    expect(go.track?.row.cells).toEqual(['Back', 'go to page', 'menu']);
    const next = press([button('b', { behavior: 'page.go', goTo: 'next', label: 'Next' })], 'b');
    expect(next.track?.row.cells).toEqual(['Next', 'go to page', 'next']);
    const cal = press(
      [button('b', { behavior: 'cta.calendar', eventStart: '2026-11-01T18:00:00Z', eventTitle: 'Launch night', label: 'Add' })],
      'b'
    );
    expect(cal.track?.row.cells).toEqual(['Add', 'calendar', 'Launch night']);
    expect(press([button('b', { behavior: 'cta.open', openUrl: 'javascript:alert(1)' })], 'b').track).toBeUndefined();
    expect(press([button('b', { behavior: 'widget.reveal', revealLayerId: 't' })], 'b').track).toBeUndefined();
    const noDoc = pressPenAction({
      layers: [button('b', { behavior: 'page.go', goTo: 'next' })],
      layerId: 'b',
      state: emptyPenViewerState()
    });
    expect(noDoc.track?.widgetId).toBeUndefined();
  });

  it('widget.reveal adds the target to revealed state', () => {
    const r = press([button('b', { behavior: 'widget.reveal', revealLayerId: 't' })], 'b');
    expect(r.effect.kind).toBe('none');
    expect(r.state.revealed).toEqual(['t']);
  });

  it('poll.vote uses bindRowId and the group widget id', () => {
    const r = press([group, button('b', { behavior: 'poll.vote', bindRowId: 'opt-a', parentGroupId: 'g' })], 'b');
    expect(r.effect).toEqual({ kind: 'vote', layerId: 'b', optionId: 'opt-a', widgetId: 'doc-1:g' });
    expect(r.state.voted).toEqual({ g: 'opt-a' });
  });

  it('a write-in vote sends the group input text and needs some text', () => {
    const layers = [
      group,
      { id: 'field', kind: 'text' as const, widgetElement: 'input' as const, parentGroupId: 'g', x: 0, y: 0, w: 80, h: 20, zIndex: 2 },
      button('other', { behavior: 'poll.vote', bindRowId: 'other', parentGroupId: 'g', writeIn: true })
    ];
    expect(press(layers, 'other').effect.kind).toBe('none');
    const typed = { ...emptyPenViewerState(), inputs: { field: '  Dark   mode ' } };
    expect(press(layers, 'other', typed).effect).toEqual({
      kind: 'vote',
      layerId: 'other',
      optionId: 'other',
      widgetId: 'doc-1:g',
      writeIn: 'Dark mode'
    });
  });

  it('widget.toggle flips present on the second press', () => {
    const layers = [group, button('b', { behavior: 'widget.toggle', parentGroupId: 'g' })];
    const first = press(layers, 'b');
    expect(first.effect).toMatchObject({ kind: 'widget_row', widgetId: 'doc-1:g', row: { trigger: 'widget.toggle', present: true } });
    const second = press(layers, 'b', first.state);
    expect(second.effect).toMatchObject({ row: { present: false } });
    expect(second.state.toggled).toEqual([]);
  });

  it('widget.stamp writes a timestamped row', () => {
    const r = pressPenAction({
      layers: [button('b', { behavior: 'widget.stamp' })],
      layerId: 'b',
      state: emptyPenViewerState(),
      actorId: 'actor',
      now: '2026-01-01T00:00:00.000Z'
    });
    expect(r.effect).toMatchObject({
      kind: 'widget_row',
      row: { trigger: 'widget.stamp', actorId: 'actor', createdAt: '2026-01-01T00:00:00.000Z' }
    });
  });

  it('widget.rank upserts the full order on each press', () => {
    const layers = [
      group,
      button('r1', { behavior: 'widget.rank', parentGroupId: 'g', label: 'A' }),
      button('r2', { behavior: 'widget.rank', parentGroupId: 'g', label: 'B' })
    ];
    const first = press(layers, 'r2');
    expect(first.effect).toMatchObject({ row: { headers: ['A', 'B'], cells: ['', '1'] } });
    const second = press(layers, 'r1', first.state);
    expect(second.effect).toMatchObject({ row: { cells: ['2', '1'] } });
  });

  it('widget.allocate only writes once the total is spent', () => {
    const layers = [
      group,
      button('a1', { behavior: 'widget.allocate', parentGroupId: 'g', label: 'A', allocateTotal: 2 }),
      button('a2', { behavior: 'widget.allocate', parentGroupId: 'g', label: 'B', allocateTotal: 2 })
    ];
    const first = press(layers, 'a1');
    expect(first.effect.kind).toBe('none');
    const second = press(layers, 'a2', first.state);
    expect(second.effect).toMatchObject({ kind: 'widget_row', row: { headers: ['A', 'B'], cells: ['1', '1'] } });
  });

  it('widget.submit routes by destination', () => {
    const input: PenPageLayer = {
      id: 'in',
      kind: 'text',
      widgetElement: 'input',
      name: 'Email',
      parentGroupId: 'g',
      x: 0,
      y: 0,
      w: 40,
      h: 20,
      zIndex: 2
    };
    const state = { ...emptyPenViewerState(), inputs: { in: 'me@x.com' } };
    const mail = press([group, input, button('s', { behavior: 'widget.submit', parentGroupId: 'g', submitTo: 'a@b.com', label: 'Send' })], 's', state);
    expect(mail.effect.kind).toBe('mailto');
    expect((mail.effect as { href: string }).href).toContain('Email%3A%20me%40x.com');
    const pn = press([group, input, button('s', { behavior: 'widget.submit', parentGroupId: 'g', submitTo: 'friend' })], 's', state);
    expect(mail.effect).toMatchObject({ to: 'a@b.com' });
    expect(pn.effect).toMatchObject({ kind: 'messaging', body: 'Email: me@x.com', to: 'friend' });
    const sheet = press([group, input, button('s', { behavior: 'widget.submit', parentGroupId: 'g' })], 's', state);
    expect(sheet.effect).toMatchObject({
      kind: 'widget_row',
      widgetId: 'doc-1:g',
      row: { trigger: 'widget.submit', headers: ['Email'], cells: ['me@x.com'], fields: { Email: 'me@x.com' } }
    });
  });

  it('widget.submit never sends a form that asks for a secret', () => {
    const secret: PenPageLayer = {
      id: 'in',
      kind: 'text',
      widgetElement: 'input',
      name: 'Your Key 2',
      parentGroupId: 'g',
      x: 0,
      y: 0,
      w: 40,
      h: 20,
      zIndex: 2
    };
    const send = button('s', { behavior: 'widget.submit', parentGroupId: 'g', submitTo: 'a@b.com' });
    expect(press([group, secret, send], 's').effect.kind).toBe('none');

    const field: PenPageLayer = { ...secret, name: 'Field 1' };
    const prompt: PenPageLayer = {
      id: 'p',
      kind: 'text',
      parentGroupId: 'g',
      x: 0,
      y: 0,
      w: 40,
      h: 20,
      zIndex: 2,
      textDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter your seed phrase' }] }] }
    };
    expect(press([group, field, prompt, send], 's').effect.kind).toBe('none');
  });

  it('ignores unknown layers and non-buttons', () => {
    expect(press([], 'nope').effect.kind).toBe('none');
    expect(press([{ id: 't', kind: 'text', x: 0, y: 0, w: 1, h: 1, zIndex: 0 }], 't').effect.kind).toBe('none');
  });
});

describe('reveal targets in feed export', () => {
  it('keeps the hidden target and shows it once revealed', () => {
    const target: PenPageLayer = {
      id: 't',
      kind: 'text',
      visible: false,
      x: 0,
      y: 40,
      w: 100,
      h: 20,
      zIndex: 3,
      textDoc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer' }] }] }
    };
    const exported = exportActionSectionForFeed({
      slug: 'p',
      doc: { type: 'doc', content: [] },
      layers: [button('b', { behavior: 'widget.reveal', revealLayerId: 't' }), target]
    });
    expect(exported.layers.map((l) => l.id).sort()).toEqual(['b', 't']);
    expect(
      buildActionOverlayAtTime(exported, 0, { revealed: [], hidden: [], steps: {} }).map((l) => l.id)
    ).toEqual(['b']);
    expect(
      buildActionOverlayAtTime(exported, 0, { revealed: ['t'], hidden: [], steps: {} })
        .map((l) => l.id)
        .sort()
    ).toEqual(['b', 't']);
  });
});
