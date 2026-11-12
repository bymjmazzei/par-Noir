/**
 * What the Content Credentials badge says about a post: who made it with what, how far the
 * signature is trusted, who is credited, what it was built from, and on someone else's work,
 * the original creator. Creators are display-only; only pN handles link.
 */

import { PARNOIR_RENDITION_GENERATOR, PEN_CLAIM_GENERATOR } from './manifestDefinition.js';
import { signerDisplay, type ManifestCreator, type ManifestSummary, type TrustStatus } from './manifestSummary.js';
import type { OriginalityResult } from './originality.js';

export interface BadgeCredit {
  label: string;
  /** pN handle to link to; null for CAWG / CreativeWork identities and key-only authors. */
  handle: string | null;
}

export interface CredentialsBadge {
  made: string;
  trust: TrustStatus;
  creator: BadgeCredit | null;
  ingredients: Array<{ title: string; made: string | null; creator: BadgeCredit | null; trust: TrustStatus | 'none' }>;
  /** On a copy or licensed remix: the creator of the original work. */
  originalBy: BadgeCredit | null;
  originality: OriginalityResult['kind'] | null;
}

export function badgeCredit(creator: ManifestCreator | null | undefined): BadgeCredit | null {
  if (!creator) return null;
  if (creator.kind === 'cawg') return { label: creator.display, handle: null };
  return creator.handle ? { label: `@${creator.handle}`, handle: creator.handle } : { label: 'a pN creator', handle: null };
}

function madeOf(generator: string | null, signer: string | null): string | null {
  if (!generator && !signer) return null;
  return signerDisplay({
    claimGenerator: generator ? { name: generator, version: null } : null,
    signer: { commonName: signer, issuer: null, alg: null, time: null }
  });
}

/** Null when the post carries no Content Credentials, or they don't validate. */
export function credentialsBadge(
  summary: ManifestSummary | null | undefined,
  originality?: OriginalityResult | null
): CredentialsBadge | null {
  if (!summary || summary.trust === 'invalid') return null;
  // A par Noir rendition (resized or transcoded for the feed) shows what made the original.
  const gen = summary.claimGenerator?.name ?? null;
  const parent = summary.ingredients.find((i) => i.relationship === 'parentOf' && i.manifestLabel);
  const rendition = parent && (gen === PARNOIR_RENDITION_GENERATOR || gen === PEN_CLAIM_GENERATOR);
  const made = (rendition ? madeOf(parent.generator, parent.signer) : null) ?? signerDisplay(summary);
  const kind = originality?.kind ?? null;
  return {
    made,
    trust: summary.trust,
    creator: badgeCredit(summary.creator),
    ingredients: summary.ingredients
      .filter((i) => i.relationship !== 'parentOf')
      .map((i) => ({ title: i.title, made: madeOf(i.generator, i.signer), creator: badgeCredit(i.creator), trust: i.trust })),
    originalBy: kind === 'copy' || kind === 'licensed_remix' ? badgeCredit(originality?.creator) : null,
    originality: kind
  };
}
