import { describe, it, expect } from 'vitest';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  pastFileName,
  promoteSectionToPast,
  sectionCurrentPath,
  listStarterTemplates,
  requireTemplate,
  compileDocumentToNote,
  signGenesis,
  signPromoteLink,
  verifyChain,
  headHashFromChain,
  hashSectionContent
} from './index.js';

function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('pen paths', () => {
  it('uses fixed current and dated past', () => {
    expect(sectionCurrentPath('doc1', 'body')).toBe('par-noir-pen/doc1/sections/body/body.pen');
    const at = new Date('2026-09-20T12:00:00Z');
    expect(pastFileName('body', at)).toBe('body-2026-09-20.pen');
    const p = promoteSectionToPast('doc1', 'body', at);
    expect(p.pastName).toBe('body-2026-09-20.pen');
    expect(p.pastPath).toContain('/past/body-2026-09-20.pen');
  });

  it('same-day collision uses timestamp suffix', () => {
    const at = new Date('2026-09-20T15:04:05Z');
    expect(pastFileName('body', at, { forceTime: true })).toBe('body-2026-09-20T150405Z.pen');
  });
});

describe('templates + compile', () => {
  it('lists starter pack', () => {
    const list = listStarterTemplates();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.some((t) => t.docType === 'note')).toBe(true);
    expect(list.some((t) => t.docType === 'post')).toBe(true);
    expect(list.some((t) => t.docType === 'carousel')).toBe(true);
    expect(list.some((t) => t.docType === 'self_hosted_feed')).toBe(true);
  });

  it('compiles note from currents', () => {
    const t = requireTemplate('note.basic.v1');
    const out = compileDocumentToNote({
      templateId: t.id,
      title: 'Hello',
      sections: [
        {
          slug: 'body',
          blocks: [{ id: '1', type: 'paragraph', text: 'Hello world' }]
        }
      ]
    });
    expect(out.contentClass).toBe('note');
    expect(out.pages[0]?.content).toContain('Hello world');
  });

  it('fails closed on unknown template', () => {
    expect(() => requireTemplate('nope')).toThrow(/unknown_pen_template/);
  });
});

describe('chain authenticity', () => {
  it('signs and verifies genesis + promote; rejects forged link', () => {
    const keys = mlDsa65Keygen();
    const genesis = signGenesis({
      docId: 'd1',
      templateId: 'note.basic.v1',
      authorPn: 'pn_a',
      clientCreatedAt: '2026-09-20T00:00:00Z',
      contentCommitment: hashSectionContent(utf8ToBytes('init')),
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    const chain = { docId: 'd1', genesis, links: [] as ReturnType<typeof signPromoteLink>[] };
    expect(verifyChain(chain).ok).toBe(true);
    const prev = headHashFromChain(chain);
    const link = signPromoteLink({
      sectionSlug: 'body',
      pastName: 'body-2026-09-20.pen',
      contentHash: hashSectionContent(utf8ToBytes('next')),
      prevHeadHash: prev,
      authorPn: 'pn_a',
      clientPromotedAt: '2026-09-20T01:00:00Z',
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    chain.links.push(link);
    expect(verifyChain(chain).ok).toBe(true);

    const forged = { ...link, contentHash: hashSectionContent(utf8ToBytes('evil')) };
    chain.links[0] = forged;
    expect(verifyChain(chain).ok).toBe(false);
  });
});
