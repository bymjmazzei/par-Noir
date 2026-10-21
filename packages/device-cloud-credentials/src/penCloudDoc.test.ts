import { afterEach, describe, expect, it, vi } from 'vitest';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import {
  bytesToBase64,
  generateChatKey,
  isDmEnvelope,
  sealSocialEnvelope,
  wrapChatKeyForOwner
} from '@par-noir/dm-crypto';
import type { PenSectionContent } from '@par-noir/pen-protocol';
import {
  decryptCloudDoc,
  decryptSectionPayload,
  encryptSectionJson,
  openWrappedDocKey,
  penCloudDocPlainText,
  readPenCloudDoc,
  sectionsToWireCipherMap,
  wireB64ToEnvelope,
  type CloudDocRaw
} from './penCloudDoc.js';
import { writePenDocFiles } from './penDriveTree.js';

const sample: PenSectionContent = {
  slug: 'body',
  doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'secret' }] }] }
};

function kem() {
  const k = ml_kem768.keygen(crypto.getRandomValues(new Uint8Array(64)));
  return { pub: bytesToBase64(k.publicKey), secret: bytesToBase64(k.secretKey) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pen section crypto', () => {
  it('encrypts to a DM envelope that is not parseable TipTap JSON', async () => {
    const key = generateChatKey();
    const envelope = await encryptSectionJson(sample, key);
    expect(isDmEnvelope(envelope)).toBe(true);
    expect(() => JSON.parse(envelope)).toThrow();
    const round = await decryptSectionPayload(envelope, key);
    expect(JSON.stringify(round.doc)).toContain('secret');
  });

  it('lazy-migrates legacy plaintext JSON and base64(JSON) without a key', async () => {
    expect((await decryptSectionPayload(JSON.stringify(sample), null)).slug).toBe('body');
    const fake = btoa(JSON.stringify(sample));
    expect(isDmEnvelope(fake)).toBe(false);
    expect((await decryptSectionPayload(fake, null)).slug).toBe('body');
  });

  it('wire map round-trips through base64 transport', async () => {
    const key = generateChatKey();
    const map = await sectionsToWireCipherMap([sample], key);
    const envelope = wireB64ToEnvelope(map.body!);
    expect(isDmEnvelope(envelope)).toBe(true);
    expect((await decryptSectionPayload(envelope, key)).slug).toBe('body');
  });
});

describe('pen cloud doc decrypt', () => {
  it('decrypts current and draft sections, falling back to earlier epoch keys', async () => {
    const oldKey = generateChatKey();
    const newKey = generateChatKey();
    const raw: CloudDocRaw = {
      manifest: { docId: 'doc-1' } as CloudDocRaw['manifest'],
      chain: { versionId: 'v1' } as CloudDocRaw['chain'],
      currentSections: [{ slug: 'body', ciphertext: await encryptSectionJson(sample, oldKey) }],
      drafts: [
        {
          draft: { draftId: 'd1' } as never,
          sections: [{ slug: 'body', ciphertext: await encryptSectionJson(sample, newKey) }]
        }
      ]
    };
    await expect(decryptCloudDoc({ raw, docKey: newKey })).rejects.toThrow();
    const doc = await decryptCloudDoc({ raw, docKey: newKey, fallbackKeys: [oldKey] });
    expect(doc.currentSections[0]?.slug).toBe('body');
    expect(doc.drafts[0]?.sections[0]?.slug).toBe('body');
  });

  it('returns an empty doc when the manifest or chain is missing', async () => {
    const doc = await decryptCloudDoc({
      raw: { manifest: null, chain: null, currentSections: [], drafts: [] },
      docKey: null
    });
    expect(doc).toEqual({ manifest: null, chain: null, currentSections: [], drafts: [] });
  });

  it('reads committed sections as plain text, else the newest draft', () => {
    const para = (text: string): PenSectionContent => ({
      slug: text,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
    });
    const base = { manifest: null, chain: null };
    expect(
      penCloudDocPlainText({ ...base, currentSections: [para('one'), para('two')], drafts: [] })
    ).toBe('one\n\ntwo');
    expect(
      penCloudDocPlainText({
        ...base,
        currentSections: [],
        drafts: [
          { draft: { updatedAt: '2026-01-01T00:00:00Z' } as never, sections: [para('old')] },
          { draft: { updatedAt: '2026-02-01T00:00:00Z' } as never, sections: [para('new')] }
        ]
      })
    ).toBe('new');
    expect(penCloudDocPlainText({ ...base, currentSections: [], drafts: [] })).toBe('');
  });
});

describe('doc key unwrap', () => {
  it('opens the owner self-wrap', async () => {
    const owner = kem();
    const docKey = generateChatKey();
    const wrapped = await wrapChatKeyForOwner(docKey, owner.secret, 'grp-1');
    expect(await openWrappedDocKey(wrapped, owner.secret, 'grp-1')).toEqual({
      docKey,
      liveClaimSecret: null,
      keyEpoch: null
    });
  });

  it('opens a sealed peer invite with its live claim secret and epoch', async () => {
    const member = kem();
    const docKey = generateChatKey();
    const sealed = await sealSocialEnvelope(member.pub, 'grp-2', {
      docKey,
      liveClaimSecret: 'claim',
      keyEpoch: 2
    });
    expect(await openWrappedDocKey(JSON.stringify(sealed), member.secret, 'grp-2')).toEqual({
      docKey,
      liveClaimSecret: 'claim',
      keyEpoch: 2
    });
  });

  it('returns null for another member or an empty wrap', async () => {
    const owner = kem();
    const other = kem();
    const wrapped = await wrapChatKeyForOwner(generateChatKey(), owner.secret, 'grp-3');
    expect(await openWrappedDocKey(wrapped, other.secret, 'grp-3')).toBeNull();
    expect(await openWrappedDocKey('', owner.secret, 'grp-3')).toBeNull();
  });
});

describe('pen drive tree on the device', () => {
  it('writes doc.json, history.chain and section files to Google', async () => {
    const names: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      expect(href).not.toContain('api.parnoir.com');
      const raw = init?.body;
      const body = raw instanceof Uint8Array ? new TextDecoder().decode(raw) : String(raw || '');
      const nameMatch = body.match(/"name":"([^"]+)"/);
      if (nameMatch) names.push(nameMatch[1]!);
      if (href.includes('upload')) return new Response(JSON.stringify({ id: 'new-file' }), { status: 200 });
      if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'new-folder' }), { status: 200 });
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchImpl);
    await writePenDocFiles({
      accessToken: 'google-token',
      pnFolderId: 'pn-folder',
      docId: 'doc-1',
      manifest: { docId: 'doc-1', title: 'Note' },
      chain: { v: 1 },
      currentSections: [{ slug: 'intro', ciphertext: 'cipher' }]
    });
    expect(names).toEqual(expect.arrayContaining(['doc.json', 'history.chain', 'intro.pen']));
  });

  it('reads an opaque doc replica and reports a missing doc as empty', async () => {
    const key = generateChatKey();
    const envelope = await encryptSectionJson(sample, key);
    const files: Record<string, string> = {
      'doc-json': JSON.stringify({ docId: 'doc-1', title: 'Note' }),
      'chain-file': JSON.stringify({ versionId: 'v1' }),
      'body-pen': envelope
    };
    const fetchImpl = vi.fn(async (url: string) => {
      const href = decodeURIComponent(String(url).replace(/\+/g, ' '));
      expect(href).not.toContain('api.parnoir.com');
      for (const [id, text] of Object.entries(files)) {
        if (href.includes(`/files/${id}`) && href.includes('alt=media')) return new Response(text, { status: 200 });
      }
      const list = (files: Array<{ id: string; name: string }>) =>
        new Response(JSON.stringify({ files }), { status: 200 });
      if (href.includes("name='par-noir-pen'")) return list([{ id: 'pen-root', name: 'par-noir-pen' }]);
      if (href.includes("name='doc.json'")) return list([{ id: 'doc-json', name: 'doc.json' }]);
      if (href.includes("name='history.chain'")) return list([{ id: 'chain-file', name: 'history.chain' }]);
      if (href.includes("name='current'")) return list([{ id: 'current-dir', name: 'current' }]);
      if (href.includes("name='drafts'")) return list([]);
      if (href.includes("'current-dir' in parents")) return list([{ id: 'body-pen', name: 'body.pen' }]);
      if (href.includes("'pen-root' in parents")) return list([{ id: 'doc-folder', name: 'doc-1' }]);
      return list([]);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const raw = await readPenCloudDoc({ accessToken: 'google-token', pnFolderId: 'pn-folder', docId: 'doc-1' });
    expect(raw.manifest?.docId).toBe('doc-1');
    expect(raw.currentSections).toEqual([{ slug: 'body', ciphertext: envelope }]);
    const doc = await decryptCloudDoc({ raw, docKey: key });
    expect(JSON.stringify(doc.currentSections[0]?.doc)).toContain('secret');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 })));
    expect(await readPenCloudDoc({ accessToken: 't', pnFolderId: 'p', docId: 'gone' })).toEqual({
      manifest: null,
      chain: null,
      currentSections: [],
      drafts: []
    });
  });
});
