/**
 * Hermetic acceptance for Pen protocol spine: create → promote → verify;
 * forged link rejected. Collab A↔B live Drive is manual/local.
 */

import { describe, it, expect } from 'vitest';
import {
  emptySection,
  requireTemplate,
  listStarterTemplates,
  signGenesis,
  signPromoteLink,
  verifyChain,
  hashSectionContent,
  headHashFromChain,
  promoteSectionToPast,
  compileDocumentToNote,
  penSectionPromoteFanout,
  PEN_SECTION_PROMOTE_KIND
} from '@par-noir/pen-protocol';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';

describe('Pen v1 acceptance (hermetic)', () => {
  it('starter pack includes post, carousel, notes, self-hosted feed', () => {
    const ids = listStarterTemplates().map((t) => t.id);
    expect(ids.some((id) => id.includes('post'))).toBe(true);
    expect(ids.some((id) => id.includes('carousel'))).toBe(true);
    expect(ids.some((id) => id.includes('note'))).toBe(true);
    expect(ids.some((id) => id.includes('feed'))).toBe(true);
  });

  it('A creates doc with genesis; promote verifies; forge fails', () => {
    const keys = mlDsa65Keygen();
    const template = requireTemplate(listStarterTemplates()[0]!.id);
    const docId = 'pen_accept_1';
    const sections = template.sections.map((s) => emptySection(s.slug));
    const commitment = hashSectionContent(new TextEncoder().encode(JSON.stringify(sections)));
    const genesis = signGenesis({
      docId,
      templateId: template.id,
      authorPn: 'pn-alice',
      clientCreatedAt: new Date().toISOString(),
      contentCommitment: commitment,
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    let chain = { docId, genesis, links: [] as ReturnType<typeof signPromoteLink>[] };
    expect(verifyChain(chain).ok).toBe(true);

    const section = sections[0]!;
    section.blocks.push({ id: 'b1', type: 'paragraph', text: 'hello from A' });
    const now = new Date();
    const paths = promoteSectionToPast(docId, section.slug, now);
    const bytes = new TextEncoder().encode(JSON.stringify(section));
    const contentHash = hashSectionContent(bytes);
    const link = signPromoteLink({
      sectionSlug: section.slug,
      pastName: paths.pastName,
      contentHash,
      prevHeadHash: headHashFromChain(chain),
      authorPn: 'pn-alice',
      clientPromotedAt: now.toISOString(),
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    chain = { ...chain, links: [link] };
    expect(verifyChain(chain).ok).toBe(true);

    const forged = { ...link, contentHash: '0'.repeat(96) };
    expect(verifyChain({ ...chain, links: [forged] }).ok).toBe(false);

    const compiled = compileDocumentToNote({
      templateId: template.id,
      title: 'T',
      sections
    });
    expect(compiled.contentClass).toBe('note');

    const fanout = penSectionPromoteFanout(['a'.repeat(64), 'b'.repeat(64)]);
    expect(fanout).toHaveLength(2);
    expect(fanout[0]!.jobType).toBe(PEN_SECTION_PROMOTE_KIND);
  });

  it('B promote appends after A head', () => {
    const a = mlDsa65Keygen();
    const b = mlDsa65Keygen();
    const template = requireTemplate(listStarterTemplates()[0]!.id);
    const docId = 'pen_accept_ab';
    const sections = template.sections.map((s) => emptySection(s.slug));
    const genesis = signGenesis({
      docId,
      templateId: template.id,
      authorPn: 'pn-a',
      clientCreatedAt: new Date().toISOString(),
      contentCommitment: hashSectionContent(new TextEncoder().encode('x')),
      secretKey: a.secretKey,
      publicKey: a.publicKey
    });
    let chain = { docId, genesis, links: [] as ReturnType<typeof signPromoteLink>[] };

    const paths = promoteSectionToPast(docId, sections[0]!.slug, new Date());
    const aLink = signPromoteLink({
      sectionSlug: sections[0]!.slug,
      pastName: paths.pastName,
      contentHash: hashSectionContent(new TextEncoder().encode('a-edit')),
      prevHeadHash: headHashFromChain(chain),
      authorPn: 'pn-a',
      clientPromotedAt: new Date().toISOString(),
      secretKey: a.secretKey,
      publicKey: a.publicKey
    });
    chain = { ...chain, links: [aLink] };

    const bPaths = promoteSectionToPast(docId, sections[0]!.slug, new Date(Date.now() + 1000));
    const bLink = signPromoteLink({
      sectionSlug: sections[0]!.slug,
      pastName: bPaths.pastName,
      contentHash: hashSectionContent(new TextEncoder().encode('b-edit')),
      prevHeadHash: headHashFromChain(chain),
      authorPn: 'pn-b',
      clientPromotedAt: new Date().toISOString(),
      secretKey: b.secretKey,
      publicKey: b.publicKey
    });
    chain = { ...chain, links: [...chain.links, bLink] };
    expect(verifyChain(chain).ok).toBe(true);
    expect(chain.links).toHaveLength(2);
  });
});
