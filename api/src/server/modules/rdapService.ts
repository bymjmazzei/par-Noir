/**
 * Domain registration dates from RDAP. A re-registered domain reports its new date,
 * which is what lets an older first-come claim keep its handle.
 */

import { parse as parseDomain } from 'tldts';

const RDAP_TIMEOUT_MS = 8000;

export async function fetchDomainRegistrationDate(
  domainRaw: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const registrable = parseDomain(String(domainRaw || ''), { allowPrivateDomains: false }).domain;
  if (!registrable) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RDAP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(registrable)}`, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    const reg = body.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    if (!reg || Number.isNaN(Date.parse(reg))) return null;
    return new Date(reg).toISOString();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
