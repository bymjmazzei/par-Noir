import { describe, it, expect } from 'vitest';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import {
  pastFileName,
  promoteSectionToPast,
  sectionCurrentPath,
  currentSectionPath,
  currentDirPath,
  draftDirPath,
  draftSectionPath,
  pastVersionDirPath,
  publishCurrentToPast,
  pastVersionId,
  canPenRole,
  resolvePenRole,
  applyRoleChange,
  ensureOwnerAssignment,
  listStarterTemplates,
  requireTemplate,
  compileDocumentToNote,
  compileSetToNote,
  snapshotPenEmbeds,
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
  assertTemplateClassInvariants,
  listBrowseFeaturedTemplates,
  blankTemplateForClass,
  templatesRootPath,
  templateManifestPath,
  fontsRootPath,
  fontsIndexPath,
  docFontsDirPath,
  docFontPath,
  collectUsedCustomFonts,
  isCustomPenFont,
  PEN_SYSTEM_FONTS,
  PEN_GOOGLE_FONTS_FEATURED,
  layerLockFingerprint,
  type PenSectionContent
} from './index.js';
import { docToHtml } from './renderRich.js';

function utf8ToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('pen paths', () => {
  it('uses current / drafts / past per doc', () => {
    expect(currentDirPath('doc1')).toBe('par-noir-pen/doc1/current');
    expect(currentSectionPath('doc1', 'body')).toBe('par-noir-pen/doc1/current/body.pen');
    expect(sectionCurrentPath('doc1', 'body')).toBe('par-noir-pen/doc1/current/body.pen');
    expect(draftDirPath('doc1', 'd1')).toBe('par-noir-pen/doc1/drafts/d1');
    expect(draftSectionPath('doc1', 'd1', 'body')).toBe('par-noir-pen/doc1/drafts/d1/body.pen');
    const at = new Date('2026-09-20T12:00:00Z');
    expect(pastVersionId(at)).toBe('v-2026-09-20');
    const pub = publishCurrentToPast('doc1', at);
    expect(pub.versionId).toBe('v-2026-09-20');
    expect(pub.pastDir).toBe('par-noir-pen/doc1/past/v-2026-09-20');
    expect(pastVersionDirPath('doc1', pub.versionId)).toBe(pub.pastDir);
  });

  it('owner fonts and doc-scoped font paths', () => {
    expect(fontsRootPath()).toBe('par-noir-pen/fonts');
    expect(fontsIndexPath()).toBe('par-noir-pen/fonts.index.json');
    expect(docFontsDirPath('doc1')).toBe('par-noir-pen/doc1/fonts');
    expect(docFontPath('doc1', 'f1')).toBe('par-noir-pen/doc1/fonts/f1.penfont');
  });
});

describe('pen fonts helpers', () => {
  it('classifies platform vs custom fonts', () => {
    expect(isCustomPenFont('Arial')).toBe(false);
    expect(isCustomPenFont(PEN_SYSTEM_FONTS[0])).toBe(false);
    expect(isCustomPenFont(PEN_GOOGLE_FONTS_FEATURED[0])).toBe(false);
    expect(isCustomPenFont('My Weird Display')).toBe(true);
  });

  it('collects usedCustomFonts from marks + index', () => {
    const sections: PenSectionContent[] = [
      {
        slug: 'body',
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Hi',
                  marks: [
                    {
                      type: 'textStyle',
                      attrs: { fontFamily: 'My Weird Display' }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    ];
    const used = collectUsedCustomFonts({
      sections,
      customIndex: [{ fontId: 'font-1', family: 'My Weird Display' }]
    });
    expect(used).toEqual([{ fontId: 'font-1', family: 'My Weird Display' }]);
  });
});

describe('pen paths legacy', () => {
  it('same-day collision uses timestamp suffix', () => {
    const at = new Date('2026-09-20T15:04:05Z');
    expect(pastVersionId(at, { forceTime: true })).toBe('v-2026-09-20T150405Z');
    expect(pastFileName('body', at, { forceTime: true })).toBe('body-2026-09-20T150405Z.pen');
    const p = promoteSectionToPast('doc1', 'body', at, { forceTime: true });
    expect(p.pastPath).toContain('/past/v-2026-09-20T150405Z/body.pen');
  });
});

describe('pen roles', () => {
  it('enforces ACL matrix', () => {
    expect(canPenRole('owner', 'revoke')).toBe(true);
    expect(canPenRole('collaborator', 'invite')).toBe(true);
    expect(canPenRole('collaborator', 'accept_suggestion')).toBe(true);
    expect(canPenRole('commentor', 'submit_suggestion')).toBe(true);
    expect(canPenRole('commentor', 'invite')).toBe(false);
    expect(canPenRole('viewer', 'comment')).toBe(false);
  });

  it('owner is unrevokable', () => {
    const owner = 'ownerhash';
    const roles = ensureOwnerAssignment([], owner);
    expect(resolvePenRole(roles, owner, owner)).toBe('owner');
    expect(applyRoleChange(roles, owner, owner, null, 'owner')).toBeNull();
    expect(applyRoleChange(roles, owner, owner, 'viewer', 'owner')).toBeNull();
    const next = applyRoleChange(roles, owner, 'peer', 'commentor', 'collaborator');
    expect(next?.some((r) => r.pnHash === 'peer' && r.role === 'commentor')).toBe(true);
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

  it('consumer categories are social projects library time custom; records is kit', () => {
    expect(listConsumerCategories().map((c) => c.id)).toEqual([
      'social',
      'projects',
      'library',
      'time',
      'custom'
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

  it('snapshots penEmbed nodes into inline TipTap content', async () => {
    const sections = await snapshotPenEmbeds(
      [
        {
          slug: 'body',
          doc: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
              {
                type: 'penEmbed',
                attrs: { docId: 'doc_src', sectionSlug: 'body', title: 'Source' }
              },
              { type: 'paragraph', content: [{ type: 'text', text: 'After' }] }
            ]
          }
        }
      ],
      async (ref) => {
        expect(ref.docId).toBe('doc_src');
        return {
          title: 'Source note',
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Snapshotted body' }] }]
          }
        };
      }
    );
    const html = docToHtml(sections[0]!.doc);
    expect(html).toContain('Before');
    expect(html).toContain('Source note');
    expect(html).toContain('Snapshotted body');
    expect(html).toContain('After');
    expect(html).not.toContain('live reference');
  });

  it('compiles set.basic.v1 embeds into note pages', async () => {
    const out = await compileSetToNote({
      title: 'My Set',
      sections: [
        {
          slug: 'primary',
          doc: {
            type: 'doc',
            content: [
              {
                type: 'penEmbed',
                attrs: { docId: 'doc_a', sectionSlug: null, title: 'Primary' }
              }
            ]
          }
        },
        {
          slug: 'sources',
          doc: {
            type: 'doc',
            content: [
              {
                type: 'penEmbed',
                attrs: { docId: 'doc_b', sectionSlug: 'body', title: 'Source B' }
              }
            ]
          }
        }
      ],
      resolveDoc: async (ref) => {
        if (ref.docId === 'doc_a') {
          return {
            title: 'Alpha',
            sections: [
              {
                slug: 'body',
                doc: {
                  type: 'doc',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha body' }] }]
                }
              }
            ]
          };
        }
        return {
          title: 'Beta',
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Beta body' }] }]
          }
        };
      }
    });
    expect(out.contentClass).toBe('note');
    expect(out.templateId).toBe('set.basic.v1');
    expect(out.pages.length).toBe(2);
    expect(out.pages[0]?.content).toContain('Alpha body');
    expect(out.pages[1]?.content).toContain('Beta body');
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

  it('creates video layers and reorders stack front-first', async () => {
    const {
      emptySection,
      ensureDefaultTextLayer,
      createVideoLayer,
      upsertLayer,
      reorderLayersStack
    } = await import('./index.js');
    let sec = ensureDefaultTextLayer(emptySection('body'));
    const video = createVideoLayer('https://example.com/v.mp4', { zIndex: 5 });
    sec = upsertLayer(sec, video);
    const idsFrontFirst = [...(sec.layers || [])]
      .sort((a, b) => b.zIndex - a.zIndex)
      .map((l) => l.id);
    const flipped = [...idsFrontFirst].reverse();
    sec = reorderLayersStack(sec, flipped);
    const after = [...(sec.layers || [])].sort((a, b) => b.zIndex - a.zIndex).map((l) => l.id);
    expect(after[0]).toBe(flipped[0]);
    expect(sec.layers!.some((l) => l.kind === 'video')).toBe(true);
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

describe('template seeds + Mini featured + layer locks', () => {
  it('starters expose seedSections and browseFeatured for social notes', () => {
    const note = requireTemplate('note.basic.v1');
    expect(note.seedSections?.length).toBeGreaterThan(0);
    expect(note.browseFeatured).toBe(true);
    const featured = listBrowseFeaturedTemplates('social.note');
    expect(featured.length).toBeGreaterThan(0);
    expect(featured.every((t) => t.classId === 'social.note' && t.browseFeatured)).toBe(true);
  });

  it('blankTemplateForClass yields empty seeds with no object layers', () => {
    const blank = blankTemplateForClass('social.note');
    expect(blank?.id).toBe('blank.social.note');
    expect(blank?.seedSections?.[0]?.doc).toBeTruthy();
    expect(blank?.seedSections?.[0]?.layers?.length ?? 0).toBe(0);
    expect(templatesRootPath()).toBe('par-noir-pen/templates');
    expect(templateManifestPath('personal_abc')).toBe(
      'par-noir-pen/templates/personal_abc/template.json'
    );
  });

  it('ensureDefaultTextLayer leaves truly blank sections without object layers', async () => {
    const { emptySection, ensureDefaultTextLayer } = await import('./index.js');
    const blank = ensureDefaultTextLayer(emptySection('body'));
    expect(blank.layers).toEqual([]);
  });

  it('createGroupFromSelection nests members and moveGroupByDelta moves as a unit', async () => {
    const {
      emptySection,
      createTextLayer,
      upsertLayer,
      createGroupFromSelection,
      moveGroupByDelta,
      setLayerParentGroup,
      layerStrokeStyle
    } = await import('./index.js');
    let sec = emptySection('body');
    const a = createTextLayer({ x: 10, y: 10, w: 20, h: 10, zIndex: 1 });
    const b = createTextLayer({ x: 40, y: 20, w: 20, h: 10, zIndex: 2 });
    sec = upsertLayer(upsertLayer(sec, a), b);
    const { section: grouped, groupId } = createGroupFromSelection(sec, [a.id, b.id]);
    const group = grouped.layers!.find((l) => l.id === groupId);
    expect(group?.kind).toBe('group');
    expect(grouped.layers!.filter((l) => l.parentGroupId === groupId)).toHaveLength(2);
    const moved = moveGroupByDelta(grouped, groupId, 5, -3);
    expect(moved.layers!.find((l) => l.id === a.id)?.x).toBe(15);
    expect(moved.layers!.find((l) => l.id === b.id)?.y).toBe(17);
    const ungrouped = setLayerParentGroup(moved, a.id, null);
    expect(ungrouped.layers!.find((l) => l.id === a.id)?.parentGroupId).toBeFalsy();
    const stroked = {
      ...a,
      strokeColor: '#ff0000',
      strokeWidth: 2,
      strokeAlign: 'inside' as const
    };
    expect(layerStrokeStyle(stroked).border).toContain('2px');
  });

  it('layerLockFingerprint ignores body text and tracks visibility/position lock', () => {
    const base: PenSectionContent = {
      slug: 'body',
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
      layers: [
        {
          id: 'l1',
          kind: 'text',
          x: 10,
          y: 10,
          w: 80,
          h: 40,
          zIndex: 1,
          visible: true,
          positionLocked: false
        }
      ]
    };
    const editedText: PenSectionContent = {
      ...base,
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CHANGED' }] }] }
    };
    expect(layerLockFingerprint([base])).toBe(layerLockFingerprint([editedText]));
    const locked: PenSectionContent = {
      ...base,
      layers: [{ ...base.layers![0], positionLocked: true, visible: false }]
    };
    expect(layerLockFingerprint([base])).not.toBe(layerLockFingerprint([locked]));
  });
});
