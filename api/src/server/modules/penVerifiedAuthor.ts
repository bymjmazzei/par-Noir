import { parseVerifiedAllowlistEnv, pnMatchesVerifiedAllowlist } from '@par-noir/pen-protocol';

export function penVerifiedAuthorAllowlist(): string[] {
  return parseVerifiedAllowlistEnv(process.env.PEN_VERIFIED_AUTHOR_PN_IDS);
}

export function isPenVerifiedAuthor(pnIdentifier: string | null | undefined): boolean {
  return pnMatchesVerifiedAllowlist(pnIdentifier, penVerifiedAuthorAllowlist());
}
