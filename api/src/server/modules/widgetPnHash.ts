import { hashPnIdentifier } from '@par-noir/pen-protocol';

/** Widget owner/actor hash. Pen sends `pn-…`, browse strips the prefix; both must hash alike. */
export function widgetPnHash(pn: string): string {
  const trimmed = pn.trim();
  return hashPnIdentifier(trimmed.startsWith('pn-') ? trimmed : `pn-${trimmed}`);
}
