/**
 * Connect-to-feed target + licensing gates.
 * Browse/networks: all unlocked users. Public templates + monetized licensing: verified only.
 */

import {
  normalizeLicensingRoot,
  type PenLicensingRoot
} from '@par-noir/pen-protocol';

export const PUBLIC_TEMPLATE_REQUIRES_VERIFICATION =
  'public_template_requires_verification';

/** Strip or reject pen-templates when the author is not verified. */
export function assertAggregatorTargetsAllowed(
  targets: string[],
  canPublishPublicTemplate: boolean
): string[] {
  const cleaned = targets.filter(Boolean);
  if (!cleaned.length) return ['browse'];
  if (cleaned.includes('pen-templates') && !canPublishPublicTemplate) {
    throw new Error(PUBLIC_TEMPLATE_REQUIRES_VERIFICATION);
  }
  return cleaned;
}

/** UI helper: drop pen-templates when unverified without throwing. */
export function sanitizeAggregatorTargets(
  targets: string[],
  canPublishPublicTemplate: boolean
): string[] {
  if (canPublishPublicTemplate) return targets.filter(Boolean);
  return targets.filter((t) => t && t !== 'pen-templates');
}

/** Every Connect-to-feed / publish handoff must carry a normalized licensing root. */
export function requireLicensingOnHandoff(
  licensing: PenLicensingRoot | null | undefined
): PenLicensingRoot {
  if (!licensing || typeof licensing !== 'object') {
    throw new Error('licensing_required_on_publish');
  }
  return licensing;
}

export function licensingForPublish(
  raw: PenLicensingRoot | undefined,
  ownerPnHash: string | null | undefined,
  opts: {
    membership: boolean;
    connectReady?: boolean;
    musicAsset?: boolean;
  }
): PenLicensingRoot {
  return requireLicensingOnHandoff(
    normalizeLicensingRoot(raw, ownerPnHash, {
      membership: opts.membership,
      connectReady: opts.connectReady,
      musicAsset: opts.musicAsset
    })
  );
}
