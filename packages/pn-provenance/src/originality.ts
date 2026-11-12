/**
 * Originality rule v1, from verified embedded manifests only:
 * - original: the uploader is the credited creator, nobody is credited, or there is no manifest;
 * - licensed_remix: someone else is credited and their license allows derivatives;
 * - copy: someone else is credited and nothing permits reuse.
 * An invalid manifest proves nothing, so it counts as no manifest.
 */

import type { ManifestCreator, ManifestSummary } from './manifestSummary.js';

export type OriginalityKind = 'original' | 'licensed_remix' | 'copy';

export interface OriginalityResult {
  kind: OriginalityKind;
  /** The credited creator someone else's work is attributed to (remix or copy). */
  creator: ManifestCreator | null;
  /** True for a verified original: credited to the uploader with a proof that can't be self-made. */
  verifiedOriginal: boolean;
  reason:
    | 'no_manifest'
    | 'invalid_manifest'
    | 'no_credited_creator'
    | 'uploader_is_creator'
    | 'license_allows_derivatives'
    | 'license_forbids_reuse';
}

export interface Uploader {
  /** Key ids (SHA3-384 of ML-DSA keys) the uploader signs with. */
  authorKeyIds: readonly string[];
  /** Handles the uploader holds. */
  handles?: readonly string[];
}

const DERIVATIVES_ALLOWED = new Set(['cc-by', 'cc-by-sa', 'cc0', 'public-domain']);
const NON_COMMERCIAL = new Set(['cc-by-nc', 'cc-by-nc-sa']);

export function licenseAllowsDerivatives(workLicense: string | null | undefined, monetized: boolean): boolean {
  if (!workLicense) return false;
  if (DERIVATIVES_ALLOWED.has(workLicense)) return true;
  return !monetized && NON_COMMERCIAL.has(workLicense);
}

function isUploader(creator: ManifestCreator, uploader: Uploader): boolean {
  if (creator.kind !== 'pn') return false;
  if (uploader.authorKeyIds.includes(creator.authorKeyId)) return true;
  return !!creator.handle && !!uploader.handles?.includes(creator.handle);
}

export function resolveOriginality(
  summary: ManifestSummary | null,
  uploader: Uploader,
  opts: { monetized: boolean }
): OriginalityResult {
  if (!summary) return { kind: 'original', creator: null, verifiedOriginal: false, reason: 'no_manifest' };
  if (summary.trust === 'invalid') {
    return { kind: 'original', creator: null, verifiedOriginal: false, reason: 'invalid_manifest' };
  }
  const creator = summary.creator;
  if (!creator) return { kind: 'original', creator: null, verifiedOriginal: false, reason: 'no_credited_creator' };

  if (!isUploader(creator, uploader)) {
    return licenseAllowsDerivatives(summary.workLicense, opts.monetized)
      ? { kind: 'licensed_remix', creator, verifiedOriginal: false, reason: 'license_allows_derivatives' }
      : { kind: 'copy', creator, verifiedOriginal: false, reason: 'license_forbids_reuse' };
  }

  // The uploader made this file; credited work it was built from still decides remix or copy.
  const foreign = summary.ingredients.filter(
    (ing) =>
      ing.relationship === 'componentOf' && ing.creator && ing.trust !== 'invalid' && !isUploader(ing.creator, uploader)
  );
  const forbidden = foreign.find((ing) => !licenseAllowsDerivatives(ing.workLicense, opts.monetized));
  if (forbidden) {
    return { kind: 'copy', creator: forbidden.creator, verifiedOriginal: false, reason: 'license_forbids_reuse' };
  }
  if (foreign.length) {
    return { kind: 'licensed_remix', creator: foreign[0]!.creator, verifiedOriginal: false, reason: 'license_allows_derivatives' };
  }
  // Proof: a trusted signer plus a pN author assertion whose receipt binds the key to a handle.
  return {
    kind: 'original',
    creator,
    verifiedOriginal: summary.trust === 'trusted' && creator.kind === 'pn' && !!summary.pnAuthor?.handle,
    reason: 'uploader_is_creator',
  };
}
