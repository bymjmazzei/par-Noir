import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultLicensingRoot,
  reuseContractForAttachments,
  type PenSectionContent
} from '@par-noir/pen-protocol';
import type { PenSession } from './penSession';

const createDocFromTemplate = vi.fn(
  async (input: {
    title?: string;
    templateId: string;
    templates?: Array<{ seedSections?: PenSectionContent[] }>;
  }) => {
    const sections = input.templates?.[0]?.seedSections || [];
    return {
      manifest: {
        docId: 'pen_clone',
        title: input.title || 'Widget',
        templateId: input.templateId,
        templateVersion: '1',
        classId: 'widgets.widget',
        docType: 'widget',
        toc: sections.map((section) => section.slug),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      sections,
      chain: { docId: 'pen_clone', genesis: { hash: 'g' }, links: [] }
    };
  }
);

vi.mock('./createDocFromTemplate', () => ({
  createDocFromTemplate: (...args: unknown[]) => createDocFromTemplate(...args)
}));

import { clonePublishedWidget } from './widgetClone';

const memory = new Map<string, string>();

describe('clonePublishedWidget', () => {
  beforeEach(() => {
    memory.clear();
    createDocFromTemplate.mockClear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => {
          memory.set(key, value);
        },
        removeItem: (key: string) => {
          memory.delete(key);
        },
        clear: () => memory.clear(),
        key: () => null,
        length: 0
      }
    });
  });

  it('writes the clone under the user template directory and mints their sheet', async () => {
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
    ];
    const cloned = await clonePublishedWidget({
      session: { pnIdentifier: 'pn_user', accessToken: 'token' } as PenSession,
      fileId: 'file-1',
      title: 'Poll',
      sections,
      mintSheet: async () => 'sheet-user'
    });
    expect(cloned.cloudPath.startsWith('par-noir-pen/templates/')).toBe(true);
    const passed = createDocFromTemplate.mock.calls[0]?.[0] as {
      templates?: Array<{ seedSections?: PenSectionContent[] }>;
    };
    expect(JSON.stringify(passed.templates?.[0]?.seedSections)).not.toContain('sheet-author');
    const group = cloned.bundle.sections[0]?.layers?.find((layer) => layer.id === 'g');
    expect(group?.spreadsheetId).toBe('sheet-user');
    const stored = [...memory.values()].join('\n');
    expect(stored).toContain(cloned.cloudPath);
    expect(stored).not.toContain('sheet-author');
    expect(stored).toContain('sheet-user');
  });

  it('stamps lineage and the implied layout reuse claim', async () => {
    const cloned = await clonePublishedWidget({
      session: { pnIdentifier: 'pn_user', accessToken: 'token' } as PenSession,
      fileId: 'file-9',
      title: 'Portrait',
      classId: 'social.note',
      licensing: defaultLicensingRoot('author_hash', { membership: true }),
      basedOnTemplateId: 'pubwidget_file-9',
      sections: [
        {
          slug: 'body',
          doc: { type: 'doc', content: [] },
          layers: [
            {
              id: 't',
              kind: 'text',
              x: 0,
              y: 0,
              w: 80,
              h: 24,
              zIndex: 1
            }
          ]
        }
      ]
    });
    expect(cloned.bundle.manifest.basedOnFileId).toBe('file-9');
    expect(cloned.bundle.manifest.basedOnTemplateId).toBe('pubwidget_file-9');
    expect(cloned.bundle.manifest.classId).toBe('social.note');
    expect(cloned.bundle.manifest.licensing).toMatchObject({
      family: 'implied',
      contracts: [
        reuseContractForAttachments([
          { kind: 'layout', holderPnHash: 'author_hash', claimBps: 10000 }
        ])
      ]
    });
  });
});
