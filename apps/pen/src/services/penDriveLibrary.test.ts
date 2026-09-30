import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  setSessionDriveIndex,
} from '@par-noir/device-cloud-credentials';
import { listLibraryCloud } from './penCloudStore';
import { writePenDocFiles } from './penDriveLibrary';

describe('pen library on the device', () => {
  afterEach(() => {
    clearAllSessionCloudCredentials();
    vi.unstubAllGlobals();
  });

  it('reads library.index.json through deviceDriveCall and does not call the API', async () => {
    setSessionCloudCredentials('pn-pen', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'google-token',
          expires_at: Date.now() + 3600_000,
        },
      ],
    } as never);
    setSessionDriveIndex('pn-pen', {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox',
      sheetIds: {},
      conversationSheets: {},
    });

    const fetchImpl = vi.fn(async (url: string) => {
      const href = String(url);
      expect(href).not.toContain('api.parnoir.com');
      expect(href).not.toContain('X-PN-Cloud-Access-Token');
      if (href.includes('alt=media')) {
        return new Response(
          JSON.stringify([{ docId: 'doc-1', title: 'Note', templateId: 't', updatedAt: '2026-01-01' }]),
          { status: 200 }
        );
      }
      if (href.includes('library.index')) {
        return new Response(JSON.stringify({ files: [{ id: 'index-file', name: 'library.index.json' }] }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ files: [{ id: 'pen-root', name: 'par-noir-pen' }] }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchImpl);

    const docs = await listLibraryCloud('pn-pen');
    expect(docs[0]?.docId).toBe('doc-1');
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('writes doc.json and library.index.json to Google', async () => {
    setSessionCloudCredentials('pn-pen', {
      googleDriveAccounts: [
        {
          accountId: 'a1',
          access_token: 'google-token',
          expires_at: Date.now() + 3600_000,
        },
      ],
    } as never);
    setSessionDriveIndex('pn-pen', {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox',
      sheetIds: {},
      conversationSheets: {},
    });
    const names: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      expect(href).not.toContain('api.parnoir.com');
      const raw = init?.body;
      const body =
        raw instanceof Uint8Array
          ? new TextDecoder().decode(raw)
          : String(raw || '');
      const nameMatch = body.match(/"name":"([^"]+)"/);
      if (nameMatch) names.push(nameMatch[1]!);
      if (href.includes('upload')) {
        return new Response(JSON.stringify({ id: 'new-file' }), { status: 200 });
      }
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'new-folder' }), { status: 200 });
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    await writePenDocFiles({
      accessToken: 'google-token',
      pnFolderId: 'pn-folder',
      docId: 'doc-1',
      manifest: { docId: 'doc-1', title: 'Note' },
      chain: { v: 1 },
      currentSections: [{ slug: 'intro', ciphertext: 'cipher' }],
    });
    const { upsertLibrarySummary } = await import('./penDriveLibrary');
    await upsertLibrarySummary('google-token', 'pn-folder', {
      docId: 'doc-1',
      title: 'Note',
    });
    expect(names).toContain('doc.json');
    expect(names).toContain('library.index.json');
    expect(names).toContain('intro.pen');
  });
});
