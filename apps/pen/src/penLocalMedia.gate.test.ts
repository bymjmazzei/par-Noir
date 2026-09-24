/**
 * Gate: local media refs stay tiny; data: migrates out of localStorage JSON.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isPenLocalMediaRef,
  isPenMediaRef,
  parsePenLocalMediaId,
  parsePenMediaFileId,
  penLocalRef,
  penMediaRef,
  putLocalMedia,
  resolveLocalMediaUrl,
  resolvePenMediaSrc
} from './services/penLocalMedia';
import {
  sanitizeBundleMedia,
  stripInlineMediaFromBundle
} from './services/penLocalStoreSanitize';
import type { LocalDocBundle } from './services/penLocalStore';

const tinyPng = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
);

function fakeIdb() {
  const store = new Map<string, unknown>();
  const indexes = new Map<string, Map<string, string>>();

  class FakeReq {
    result: unknown;
    error: Error | null = null;
    onsuccess: ((ev: unknown) => void) | null = null;
    onerror: ((ev: unknown) => void) | null = null;
    onupgradeneeded: ((ev: unknown) => void) | null = null;
    ready(result: unknown) {
      this.result = result;
      queueMicrotask(() => this.onsuccess?.({ target: this }));
    }
    fail(err: Error) {
      this.error = err;
      queueMicrotask(() => this.onerror?.({ target: this }));
    }
  }

  class FakeStore {
    put(record: { id: string; docId?: string; driveFileId?: string }) {
      store.set(record.id, record);
      if (record.docId) {
        if (!indexes.has('docId')) indexes.set('docId', new Map());
        indexes.get('docId')!.set(record.id, record.docId);
      }
      if (record.driveFileId) {
        if (!indexes.has('driveFileId')) indexes.set('driveFileId', new Map());
        indexes.get('driveFileId')!.set(record.driveFileId, record.id);
      }
      const req = new FakeReq();
      req.ready(record.id);
      return req;
    }
    get(id: string) {
      const req = new FakeReq();
      req.ready(store.get(id));
      return req;
    }
    delete(id: string) {
      store.delete(id);
      const req = new FakeReq();
      req.ready(undefined);
      return req;
    }
    index(name: string) {
      return {
        get: (key: string) => {
          const req = new FakeReq();
          if (name === 'driveFileId') {
            const id = indexes.get('driveFileId')?.get(key);
            req.ready(id ? store.get(id) : undefined);
          } else {
            req.ready(undefined);
          }
          return req;
        },
        getAllKeys: (key: string) => {
          const req = new FakeReq();
          const ids: string[] = [];
          for (const [id, docId] of indexes.get('docId') || []) {
            if (docId === key) ids.push(id);
          }
          req.ready(ids);
          return req;
        }
      };
    }
  }

  class FakeTx {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    error: Error | null = null;
    objectStore() {
      return new FakeStore();
    }
    constructor() {
      queueMicrotask(() => this.oncomplete?.());
    }
  }

  class FakeDb {
    objectStoreNames = { contains: () => true };
    transaction() {
      return new FakeTx();
    }
    close() {}
    createObjectStore() {
      return {
        createIndex: () => undefined
      };
    }
  }

  return {
    open: () => {
      const req = new FakeReq();
      const db = new FakeDb();
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.({ target: req });
      });
      return req;
    },
    _store: store
  };
}

describe('penLocalMedia refs', () => {
  it('parses penlocal and penmedia refs', () => {
    expect(isPenLocalMediaRef('penlocal:abc')).toBe(true);
    expect(isPenMediaRef('penmedia:file123')).toBe(true);
    expect(parsePenLocalMediaId(penLocalRef('m1'))).toBe('m1');
    expect(parsePenMediaFileId(penMediaRef('f1'))).toBe('f1');
    expect(isPenLocalMediaRef('data:image/png;base64,xx')).toBe(false);
  });
});

describe('stripInlineMediaFromBundle', () => {
  it('strips data: from layer fields so JSON stays small', () => {
    const huge = `data:image/png;base64,${'A'.repeat(5000)}`;
    const bundle = {
      manifest: {
        docId: 'doc1',
        title: 't',
        docType: 'note',
        classId: 'social.note',
        templateId: 'social.note.basic',
        templateVersion: '1',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        toc: [],
        pagePresentation: { backgroundImage: huge }
      },
      sections: [
        {
          slug: 'main',
          doc: { type: 'doc', content: [] },
          layers: [
            {
              id: 'l1',
              kind: 'video',
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              zIndex: 1,
              videoSrc: huge
            }
          ]
        }
      ],
      chain: { docId: 'doc1', genesis: {}, links: [] }
    } as unknown as LocalDocBundle;
    const stripped = stripInlineMediaFromBundle(bundle);
    const json = JSON.stringify(stripped);
    expect(json.length).toBeLessThan(2000);
    expect(stripped.sections[0]?.layers?.[0]?.videoSrc).toBeUndefined();
    expect(stripped.manifest.pagePresentation?.backgroundImage).toBeUndefined();
  });
});

describe('putLocalMedia + resolve', () => {
  const originalIdb = globalThis.indexedDB;
  const originalUrl = globalThis.URL;

  beforeEach(() => {
    const idb = fakeIdb();
    // @ts-expect-error test stub
    globalThis.indexedDB = idb;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-media');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.indexedDB = originalIdb;
    globalThis.URL = originalUrl;
  });

  it('stores bytes and resolves a blob URL', async () => {
    const blob = new Blob([tinyPng], { type: 'image/png' });
    const put = await putLocalMedia({ docId: 'doc1', blob });
    expect(put.ref.startsWith('penlocal:')).toBe(true);
    expect(put.blobUrl).toBe('blob:mock-media');
    const url = await resolveLocalMediaUrl(put.mediaId);
    expect(url).toBe('blob:mock-media');
    const resolved = await resolvePenMediaSrc(put.ref);
    expect(resolved).toBe('blob:mock-media');
  });
});

describe('sanitizeBundleMedia', () => {
  const originalIdb = globalThis.indexedDB;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const idb = fakeIdb();
    // @ts-expect-error test stub
    globalThis.indexedDB = idb;
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:sanitized');
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const src = String(input);
      if (src.startsWith('data:')) {
        return new Response(tinyPng, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.indexedDB = originalIdb;
    globalThis.fetch = originalFetch;
  });

  it('migrates data: videoSrc to penlocal: and keeps JSON under budget', async () => {
    const dataUrl = `data:image/png;base64,${btoa(String.fromCharCode(...tinyPng))}`;
    const bundle = {
      manifest: {
        docId: 'doc_sanitize',
        title: 't',
        docType: 'note',
        classId: 'social.note',
        templateId: 'social.note.basic',
        templateVersion: '1',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        toc: []
      },
      sections: [
        {
          slug: 'main',
          doc: { type: 'doc', content: [] },
          layers: [
            {
              id: 'v1',
              kind: 'video',
              x: 0,
              y: 0,
              w: 200,
              h: 100,
              zIndex: 1,
              videoSrc: dataUrl
            }
          ]
        }
      ],
      chain: { docId: 'doc_sanitize', genesis: {}, links: [] }
    } as unknown as LocalDocBundle;
    const sanitized = await sanitizeBundleMedia(bundle);
    const src = sanitized.sections[0]?.layers?.[0]?.videoSrc;
    expect(src && isPenLocalMediaRef(src)).toBe(true);
    expect(JSON.stringify(sanitized).length).toBeLessThan(1500);
  });
});
