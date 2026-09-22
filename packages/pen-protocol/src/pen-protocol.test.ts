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
  hashSectionContent,
  listCategories,
  listConsumerCategories,
  listForms,
  listTemplatesByClass,
  listTemplatesGroupedByCategory,
  requireClass,
  getClass,
  searchPenCatalog,
  assertTemplateClassInvariants
} from './index.js';
import { docToHtml } from './renderRich.js';

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

describe('classes + templates', () => {
  it('lists starter pack with collection (not carousel)', () => {
    const list = listStarterTemplates();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(list.some((t) => t.docType === 'note')).toBe(true);
    expect(list.some((t) => t.docType === 'post')).toBe(true);
    expect(list.some((t) => t.docType === 'collection')).toBe(true);
    expect(list.some((t) => t.docType === 'self_hosted_feed')).toBe(true);
    expect(list.some((t) => t.docType === 'set')).toBe(true);
    expect(list.some((t) => t.id.includes('carousel') || t.docType === 'carousel')).toBe(false);
  });

  it('every starter has a form classId under a category', () => {
    assertTemplateClassInvariants(listStarterTemplates());
    for (const t of listStarterTemplates()) {
      const form = requireClass(t.classId);
      expect(form.parentId).toBeTruthy();
      expect(requireClass(form.parentId!).parentId).toBeUndefined();
    }
  });

  it('consumer categories are social projects library time; records is kit', () => {
    expect(listConsumerCategories().map((c) => c.id)).toEqual([
      'social',
      'projects',
      'library',
      'time'
    ]);
    expect(listCategories().map((c) => c.id)).toContain('records');
    expect(getClass('records')?.audience).toBe('kit');
    expect(listConsumerCategories().some((c) => c.id === 'records')).toBe(false);
  });

  it('social forms include set; projects include letter/note', () => {
    expect(listForms('social').map((f) => f.id).sort()).toEqual([
      'social.collection',
      'social.feed',
      'social.note',
      'social.post',
      'social.set'
    ]);
    expect(getClass('social.feed')?.entitlement).toBe('self-hosted');
    expect(listForms('projects').map((f) => f.id).sort()).toEqual([
      'projects.journal',
      'projects.letter',
      'projects.list',
      'projects.note'
    ]);
  });

  it('groups templates by category with no orphans', () => {
    const grouped = listTemplatesGroupedByCategory();
    const allIds = new Set(listStarterTemplates().map((t) => t.id));
    const seen = new Set<string>();
    for (const g of grouped) {
      for (const { templates } of g.forms) {
        for (const t of templates) seen.add(t.id);
      }
    }
    expect([...allIds].sort()).toEqual([...seen].sort());
    expect(listTemplatesByClass('social.note').length).toBe(2);
    expect(listTemplatesByClass('social.set').length).toBe(1);
    expect(listTemplatesByClass('records.register').length).toBe(1);
  });

  it('search finds notes and empty query returns nothing', () => {
    expect(searchPenCatalog('').templates).toEqual([]);
    const hit = searchPenCatalog('basic note');
    expect(hit.templates.some((t) => t.id === 'note.basic.v1')).toBe(true);
    expect(searchPenCatalog('social').categories.some((c) => c.id === 'social')).toBe(true);
  });

  it('consumer search excludes records', () => {
    const open = searchPenCatalog('register');
    expect(open.templates.some((t) => t.id === 'register.basic.v1')).toBe(true);
    const consumer = searchPenCatalog('register', { audience: 'consumer' });
    expect(consumer.templates.some((t) => t.id === 'register.basic.v1')).toBe(false);
    expect(consumer.categories.some((c) => c.id === 'records')).toBe(false);
  });

  it('invariant fails when classId points at a category', () => {
    expect(() =>
      assertTemplateClassInvariants([
        {
          id: 'bad.v1',
          classId: 'social',
          docType: 'note',
          version: '1',
          title: 'Bad',
          description: 'x',
          sections: [{ slug: 'body', title: 'Body', required: true }]
        }
      ])
    ).toThrow(/classId_must_be_form/);
  });

  it('compiles note from TipTap doc with filled style', () => {
    const t = requireTemplate('note.basic.v1');
    const out = compileDocumentToNote({
      templateId: t.id,
      title: 'Hello',
      sections: [
        {
          slug: 'body',
          doc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
                  { type: 'text', text: 'world' }
                ]
              }
            ]
          }
        }
      ]
    });
    expect(out.contentClass).toBe('note');
    expect(out.pages[0]?.content).toBe('Hello world');
    expect(out.pages[0]?.content.includes('**')).toBe(false);
    expect(out.pages[0]?.style.fontFamily).toBeTruthy();
    expect(out.pages[0]?.style.backgroundColor).toBeTruthy();
    expect(out.pages[0]?.doc?.type).toBe('doc');
  });

  it('migrates legacy blocks to TipTap and renders HTML marks', async () => {
    const { normalizeSection, docToHtml, blocksToTipTapDoc } = await import('./index.js');
    const doc = blocksToTipTapDoc([{ id: '1', type: 'paragraph', text: '**Hello** world' }]);
    expect(docToHtml(doc)).toContain('<strong>Hello</strong>');
    const sec = normalizeSection({
      slug: 'body',
      blocks: [{ id: '1', type: 'paragraph', text: '*italic*' }]
    } as never);
    expect(sec.doc.type).toBe('doc');
    expect(docToHtml(sec.doc)).toContain('<em>italic</em>');
  });

  it('fails closed on unknown template', () => {
    expect(() => requireTemplate('nope')).toThrow(/unknown_pen_template/);
  });
});

describe('page layers', () => {
  it('seeds default text layer from doc and supports multi-text', async () => {
    const {
      emptySection,
      ensureDefaultTextLayer,
      createTextLayer,
      createImageLayer,
      upsertLayer,
      assertUniqueLayerIds,
      setTextLayerDoc
    } = await import('./index.js');
    const base = emptySection('body');
    base.doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }]
    };
    const seeded = ensureDefaultTextLayer(base);
    expect(seeded.layers?.length).toBe(1);
    expect(seeded.layers![0]!.kind).toBe('text');
    expect(ensureDefaultTextLayer(seeded).layers?.length).toBe(1);

    let next = upsertLayer(seeded, createTextLayer({ x: 10, y: 50, w: 40, h: 20, zIndex: 3 }));
    next = upsertLayer(next, createImageLayer('https://example.com/a.png'));
    expect(next.layers!.length).toBe(3);
    assertUniqueLayerIds(next.layers!);
    expect(() =>
      assertUniqueLayerIds([next.layers![0]!, { ...next.layers![0]!, id: next.layers![0]!.id }])
    ).toThrow(/duplicate_layer_id/);

    const textId = next.layers!.find((l) => l.kind === 'text')!.id;
    next = setTextLayerDoc(next, textId, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Layer' }] }]
    });
    expect(next.doc.content?.[0]).toBeTruthy();
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

describe('renderRich media wrap', () => {
  it('floats image left/right and leaves none without data-wrap', () => {
    const left = docToHtml({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://x/a.png', alt: 'a', wrap: 'left' } }]
    });
    expect(left).toContain('data-wrap="left"');
    expect(left).toContain('float:left');
    const none = docToHtml({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://x/a.png', wrap: 'none' } }]
    });
    expect(none).not.toContain('data-wrap');
    expect(none).toContain('<figure');
  });

  it('renders video with same wrap float styles', () => {
    const html = docToHtml({
      type: 'doc',
      content: [{ type: 'video', attrs: { src: 'https://x/v.mp4', wrap: 'right' } }]
    });
    expect(html).toContain('<video');
    expect(html).toContain('controls');
    expect(html).toContain('data-wrap="right"');
    expect(html).toContain('float:right');
  });
});
