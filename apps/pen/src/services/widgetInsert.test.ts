import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import type { PenSession } from './penSession';
import { insertWidgetCopy } from './widgetInsert';

const createPollSheet = vi.fn(async () => 'sheet-new');

vi.mock('./pollCloud', () => ({
  createPollSheet: (...args: unknown[]) => createPollSheet(...args)
}));

const session = { pnIdentifier: 'pn_test', accessToken: 'token' } as PenSession;
const host: PenSectionContent = { slug: 'card', doc: { type: 'doc', content: [] }, layers: [] };

describe('insertWidgetCopy', () => {
  beforeEach(() => {
    createPollSheet.mockClear();
  });

  it('mints a spreadsheet for a Toggle button', async () => {
    const next = await insertWidgetCopy({
      session,
      docId: 'doc-1',
      host,
      name: 'Toggle',
      layers: [
        {
          id: 'b',
          kind: 'interactive',
          behavior: 'widget.toggle',
          x: 0,
          y: 0,
          w: 48,
          h: 24,
          zIndex: 1,
          label: 'On'
        }
      ]
    });
    const group = next.section.layers?.find((layer) => layer.id === next.groupId);
    expect(group?.spreadsheetId).toBe('sheet-new');
    expect(createPollSheet).toHaveBeenCalledTimes(1);
  });

  it('does not mint a spreadsheet for an Open button', async () => {
    const next = await insertWidgetCopy({
      session,
      docId: 'doc-1',
      host,
      name: 'Open',
      layers: [
        {
          id: 'b',
          kind: 'interactive',
          behavior: 'cta.open',
          x: 0,
          y: 0,
          w: 48,
          h: 24,
          zIndex: 1,
          label: 'Open',
          openUrl: 'https://example.com'
        }
      ]
    });
    const group = next.section.layers?.find((layer) => layer.id === next.groupId);
    expect(group?.spreadsheetId).toBeUndefined();
    expect(createPollSheet).not.toHaveBeenCalled();
  });
});
