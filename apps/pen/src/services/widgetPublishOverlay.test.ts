import { describe, expect, it } from 'vitest';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import { actionOverlaysForPost } from './penPublish';

describe('actionOverlaysForPost', () => {
  it('links the tracking spreadsheet on the post overlay', () => {
    const sections: PenSectionContent[] = [
      {
        slug: 'card',
        doc: { type: 'doc', content: [] },
        layers: [
          {
            id: 'g',
            kind: 'group',
            x: 0,
            y: 0,
            w: 120,
            h: 80,
            zIndex: 1,
            spreadsheetId: 'sheet-user'
          },
          {
            id: 'b',
            kind: 'interactive',
            parentGroupId: 'g',
            behavior: 'widget.toggle',
            x: 8,
            y: 8,
            w: 48,
            h: 24,
            zIndex: 2,
            label: 'On'
          }
        ]
      }
    ];
    expect(actionOverlaysForPost(sections)[0]?.spreadsheetId).toBe('sheet-user');
  });
});