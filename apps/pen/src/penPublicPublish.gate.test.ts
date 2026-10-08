/**
 * Gate: Connect to feed writes the owner cloud and the index.
 * Falsifies: opening Browse, or a post row carrying penTemplateKind.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { defaultLicensingRoot } from '@par-noir/pen-protocol';
import { publishPublicCloudFile } from './services/penPublicPublish';
import { publishTemplateToOwnerCloud } from './services/penPublish';
import { PUBLIC_TEMPLATE_REQUIRES_VERIFICATION } from './services/penPublishGates';
import { resolvePublishFeedIds, FIRST_PARTY_CONTENT_FEEDS } from './services/penFeedTargets';
import type { LocalDocBundle } from './services/penLocalStore';

const here = dirname(fileURLToPath(import.meta.url));

describe('Pen owner-cloud publish', () => {
  it('uploads the envelope and indexes feedIds without a template flag', async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const request = async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path === '/api/drive/files') {
        return new Response(JSON.stringify({ id: 'drive-1' }), { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: {
              objectId: 'drive-1',
              publicUrl: 'https://drive.google.com/uc?export=download&id=drive-1',
              backend: 'google_drive'
            }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT' && path.includes('/api/aggregator/metadata-index/')) {
        return new Response('{}', { status: 200 });
      }
      return new Response('unexpected', { status: 500 });
    };

    const result = await publishPublicCloudFile({
      request,
      parentFolderId: 'public-folder',
      bytes: new TextEncoder().encode('{"textPost":{"content":"hi"}}'),
      fileName: 'pen-doc.json',
      title: 'Hi',
      metadata: {
        feedIds: ['public', 'notes'],
        penDocId: 'doc-1',
        contentClass: 'note',
        fileType: 'note'
      }
    });

    expect(result.fileId).toBe('drive-1');
    const upload = calls.find((c) => c.method === 'POST' && c.path === '/api/drive/files');
    expect((upload?.body as { parents?: string[] } | undefined)?.parents).toEqual(['public-folder']);
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.path).toBe('/api/aggregator/metadata-index/drive-1');
    const body = put?.body as { feedIds?: string[]; penDocId?: string; penTemplateKind?: string };
    expect(body.feedIds).toEqual(['public', 'notes']);
    expect(body.penDocId).toBe('doc-1');
    expect(body.penTemplateKind).toBeUndefined();
  });

  it('Make public is every active content feed; a subset is only the checked ids', () => {
    const active = [...FIRST_PARTY_CONTENT_FEEDS];
    expect(resolvePublishFeedIds('all', [], active)).toEqual([
      'public',
      'media',
      'notes',
      'collections'
    ]);
    expect(resolvePublishFeedIds('selected', ['notes', 'pen-templates'], active)).toEqual(['notes']);
  });

  it('the editor does not open Browse to finish publish', () => {
    const editor = readFileSync(resolve(here, 'pages/docEditor/useDocEditorController.ts'), 'utf8');
    const publish = readFileSync(resolve(here, 'services/penPublish.ts'), 'utf8');
    const menu = readFileSync(resolve(here, 'components/PublishMenu.tsx'), 'utf8');
    for (const src of [editor, publish, menu]) {
      expect(src).not.toContain('openBrowseWithPenHandoff');
      expect(src).not.toContain('pen_publish_handoff_v1');
    }
    expect(editor).toContain('publishPostToOwnerCloud');
    expect(editor).toContain('publishTemplateToOwnerCloud');
    expect(menu).toContain('Make public');
  });

  it('a reusable template is a second index row after the post', async () => {
    const bundle = {
      manifest: {
        docId: 'doc-1',
        title: 'Hello',
        docType: 'note',
        classId: 'social.note',
        templateId: 'note.basic.portrait.v1',
        templateVersion: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        toc: [],
        publishedFileId: 'post-file'
      },
      sections: [
        {
          slug: 'body',
          doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
        }
      ],
      chain: { docId: 'doc-1', genesis: { hash: 'g' }, links: [] }
    } as unknown as LocalDocBundle;

    await expect(
      publishTemplateToOwnerCloud({
        bundle,
        templateLicensing: defaultLicensingRoot('owner'),
        verified: false,
        pnIdentifier: 'pn'
      })
    ).rejects.toThrow(PUBLIC_TEMPLATE_REQUIRES_VERIFICATION);

    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    const request = async (method: string, path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path === '/api/drive/files') {
        return new Response(JSON.stringify({ id: 'tpl-1' }), { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: {
              objectId: 'tpl-1',
              publicUrl: 'https://drive.google.com/uc?export=download&id=tpl-1',
              backend: 'google_drive'
            }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT') return new Response('{}', { status: 200 });
      return new Response('unexpected', { status: 500 });
    };

    const published = await publishTemplateToOwnerCloud({
      bundle,
      templateLicensing: defaultLicensingRoot('owner'),
      verified: true,
      pnIdentifier: 'pn',
      request,
      parentFolderId: 'public-folder'
    });
    expect(published.fileId).toBe('tpl-1');
    const put = calls.find((c) => c.method === 'PUT');
    const body = put?.body as {
      feedIds?: string[];
      penTemplateKind?: string;
      basedOnFileId?: string;
      penDocId?: string;
    };
    expect(body.feedIds).toEqual(['pen-templates']);
    expect(body.penTemplateKind).toBe('template');
    expect(body.basedOnFileId).toBe('post-file');
    expect(body.penDocId).toBe('doc-1');
  });

  it('widget building blocks may publish to pen-templates without a feed post', async () => {
    const bundle = {
      manifest: {
        docId: 'w-1',
        title: 'Sticker',
        docType: 'sticker',
        classId: 'widgets.sticker',
        templateId: 'sticker.v1',
        templateVersion: '1',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        toc: []
      },
      sections: [
        {
          slug: 'card',
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sticker' }] }]
          },
          layers: []
        }
      ],
      chain: { docId: 'w-1', genesis: { hash: 'g' }, links: [] }
    } as unknown as LocalDocBundle;

    const request = async (method: string, path: string) => {
      if (path === '/api/drive/files') {
        return new Response(JSON.stringify({ id: 'wt-1' }), { status: 200 });
      }
      if (path.includes('/ensure-public')) {
        return new Response(
          JSON.stringify({
            publicContentRef: {
              objectId: 'wt-1',
              publicUrl: 'https://drive.google.com/uc?export=download&id=wt-1',
              backend: 'google_drive'
            }
          }),
          { status: 200 }
        );
      }
      if (method === 'PUT') return new Response('{}', { status: 200 });
      return new Response('unexpected', { status: 500 });
    };

    const published = await publishTemplateToOwnerCloud({
      bundle,
      templateLicensing: defaultLicensingRoot('owner'),
      verified: true,
      pnIdentifier: 'pn',
      request,
      parentFolderId: 'public-folder'
    });
    expect(published.fileId).toBe('wt-1');
  });
});
