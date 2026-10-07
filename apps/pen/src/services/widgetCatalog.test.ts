import { describe, expect, it } from 'vitest';
import { getTemplate, sectionsFromPublishedTemplate } from '@par-noir/pen-protocol';
import type { CentralIndexEntry } from '@par-noir/aggregator-domain';
import { publicWidgetCatalog } from './widgetCatalog';

const entry = {
  fileId: 'file-1',
  submittedAt: '2026-01-01T00:00:00.000Z',
  metadata: {
    penClassId: 'widgets.widget',
    penTemplateKind: 'template',
    basedOnTemplateId: 'widget.v1',
    title: 'Poll'
  }
} as CentralIndexEntry;

describe('publicWidgetCatalog', () => {
  it('copies published layers and drops the author spreadsheet', () => {
    const published = sectionsFromPublishedTemplate({
      sections: [
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
              spreadsheetId: 'sheet-author'
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
              label: 'Go'
            }
          ]
        }
      ]
    });
    const catalog = publicWidgetCatalog([entry], new Map([['file-1', published]]));
    const layers = catalog.templates[0]?.seedSections?.[0]?.layers || [];
    expect(layers.some((layer) => layer.label === 'Go')).toBe(true);
    expect(layers.some((layer) => layer.spreadsheetId === 'sheet-author')).toBe(false);
    const starter = getTemplate('widget.v1');
    expect(starter?.seedSections?.[0]?.layers || []).toEqual([]);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('does not fall back to the empty widget.v1 seed', () => {
    const catalog = publicWidgetCatalog([entry]);
    expect(catalog.templates[0]?.seedSections).toBeUndefined();
  });

  it('keeps published notes and drops classes outside the templates catalog', () => {
    const note = {
      ...entry,
      fileId: 'note-1',
      metadata: {
        ...entry.metadata,
        penClassId: 'social.note',
        basedOnTemplateId: 'note.basic.portrait.v1',
        title: 'Portrait'
      }
    } as CentralIndexEntry;
    const kit = {
      ...entry,
      fileId: 'kit-1',
      metadata: {
        ...entry.metadata,
        penClassId: 'records.register',
        title: 'Register'
      }
    } as CentralIndexEntry;
    const catalog = publicWidgetCatalog([note, kit]);
    expect(catalog.templates.map((template) => template.classId)).toEqual(['social.note']);
    expect(catalog.templates[0]?.docType).toBe('note');
  });
});
