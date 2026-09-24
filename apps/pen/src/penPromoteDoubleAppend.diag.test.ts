/**
 * Diagnostic: double-append of the same promote link still fails verifyChain.
 * Kept as a protocol invariant check (not the Commit path gate — see
 * penPromoteSingleAppend.gate.test.ts).
 */

import { describe, it, expect } from 'vitest';
import {
  emptySection,
  listStarterTemplates,
  requireTemplate,
  signGenesis,
  signPromoteLink,
  verifyChain,
  hashSectionContent,
  headHashFromChain,
  promoteSectionToPast
} from '@par-noir/pen-protocol';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';

describe('Pen promote double-append invariant', () => {
  it('single append verifies; duplicate append → link_1_prev_mismatch', () => {
    const keys = mlDsa65Keygen();
    const template = requireTemplate(listStarterTemplates()[0]!.id);
    const docId = 'pen_diag_double_append';
    const sections = template.sections.map((s) => emptySection(s.slug));
    const commitment = hashSectionContent(new TextEncoder().encode(JSON.stringify(sections)));
    const genesis = signGenesis({
      docId,
      templateId: template.id,
      authorPn: 'pn-diag',
      clientCreatedAt: new Date().toISOString(),
      contentCommitment: commitment,
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });
    let chain = { docId, genesis, links: [] as ReturnType<typeof signPromoteLink>[] };
    expect(verifyChain(chain).ok).toBe(true);

    const section = sections[0]!;
    section.doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'once' }] }]
    };
    const now = new Date();
    const paths = promoteSectionToPast(docId, section.slug, now);
    const contentHash = hashSectionContent(new TextEncoder().encode(JSON.stringify(section)));
    const link = signPromoteLink({
      sectionSlug: section.slug,
      pastName: paths.pastName,
      contentHash,
      prevHeadHash: headHashFromChain(chain),
      authorPn: 'pn-diag',
      clientPromotedAt: now.toISOString(),
      secretKey: keys.secretKey,
      publicKey: keys.publicKey
    });

    chain = { ...chain, links: [link] };
    expect(verifyChain(chain).ok).toBe(true);

    const doubled = { ...chain, links: [...chain.links, link] };
    const result = verifyChain(doubled);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('link_1_prev_mismatch');
    }
  });
});
