/**
 * Reserved handles built only from public data: Tranco top sites (label -> its domains) and
 * Wikidata notable people/organizations (official website P856, YouTube channel P2397).
 * A protected handle lists only with one of the named domain or channel proofs.
 */

import { confusableSkeleton } from '@par-noir/public-names';
import { getDomain, parse as parseDomain } from 'tldts';
import { getDatabasePool } from '../utils/database';
import type { Queryable } from './handleReceiptService';

export interface ProtectedName {
  skeleton: string;
  display: string;
  source: string;
  sourceRef: string | null;
  requiredDomains: string[];
  requiredYoutubeChannelIds: string[];
}

type Entry = ProtectedName;

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 7 * DAY_MS;
const BATCH = 400;
const MIN_SKELETON = 3;
const USER_AGENT = 'parNoir-name-registry/1.0 (https://parnoir.com)';

function trancoTop(): number {
  const n = Number(process.env.PROTECTED_NAMES_TRANCO_TOP || 5000);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 100000) : 5000;
}

function wikidataMinSitelinks(): number {
  const n = Number(process.env.PROTECTED_NAMES_WIKIDATA_MIN_SITELINKS || 40);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 40;
}

function mapRow(row: Record<string, any>): ProtectedName {
  return {
    skeleton: String(row.skeleton),
    display: String(row.display),
    source: String(row.source),
    sourceRef: row.source_ref ? String(row.source_ref) : null,
    requiredDomains: Array.isArray(row.required_domains) ? row.required_domains.map(String) : [],
    requiredYoutubeChannelIds: Array.isArray(row.required_youtube_channel_ids)
      ? row.required_youtube_channel_ids.map(String)
      : []
  };
}

function addEntry(
  map: Map<string, Entry>,
  display: string,
  source: string,
  sourceRef: string | null,
  domain: string | null,
  channelId: string | null
): void {
  const skeleton = confusableSkeleton(display);
  if (skeleton.length < MIN_SKELETON) return;
  const cur = map.get(skeleton) ?? {
    skeleton,
    display,
    source,
    sourceRef,
    requiredDomains: [],
    requiredYoutubeChannelIds: []
  };
  if (cur.source !== source && !cur.source.split('+').includes(source)) cur.source = `${cur.source}+${source}`;
  if (domain && !cur.requiredDomains.includes(domain)) cur.requiredDomains.push(domain);
  if (channelId && !cur.requiredYoutubeChannelIds.includes(channelId)) cur.requiredYoutubeChannelIds.push(channelId);
  map.set(skeleton, cur);
}

async function fetchJson(url: string, fetchImpl: typeof fetch, accept = 'application/json'): Promise<any> {
  const res = await fetchImpl(url, { headers: { Accept: accept, 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.json();
}

/** Second-level labels of the Tranco top N, each requiring one of its own domains. */
export async function loadTranco(map: Map<string, Entry>, fetchImpl: typeof fetch = fetch): Promise<number> {
  const latest = (await fetchJson('https://tranco-list.eu/api/lists/date/latest', fetchImpl)) as {
    list_id?: string;
  };
  if (!latest.list_id) throw new Error('tranco list id missing');
  const res = await fetchImpl(`https://tranco-list.eu/download/${encodeURIComponent(latest.list_id)}/${trancoTop()}`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!res.ok) throw new Error(`tranco ${res.status}`);
  let count = 0;
  for (const line of (await res.text()).split(/\r?\n/)) {
    const domain = line.split(',')[1]?.trim().toLowerCase();
    if (!domain) continue;
    const label = parseDomain(domain).domainWithoutSuffix;
    const registrable = getDomain(domain);
    if (!label || !registrable) continue;
    addEntry(map, label, 'tranco', registrable, registrable, null);
    count++;
  }
  return count;
}

/** Notable people and organizations with an official site or YouTube channel. */
export async function loadWikidata(map: Map<string, Entry>, fetchImpl: typeof fetch = fetch): Promise<number> {
  const query = `
SELECT ?item ?label ?site ?yt WHERE {
  VALUES ?type { wd:Q5 wd:Q4830453 wd:Q891723 wd:Q43229 wd:Q215380 wd:Q431289 wd:Q6881511 wd:Q783794 }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?links .
  FILTER(?links >= ${wikidataMinSitelinks()})
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P856 ?site }
  OPTIONAL { ?item wdt:P2397 ?yt }
  FILTER(BOUND(?site) || BOUND(?yt))
}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const body = (await fetchJson(url, fetchImpl, 'application/sparql-results+json')) as {
    results?: { bindings?: Array<Record<string, { value?: string }>> };
  };
  let count = 0;
  for (const b of body.results?.bindings ?? []) {
    const label = b.label?.value;
    if (!label) continue;
    const qid = b.item?.value?.split('/').pop() ?? null;
    const site = b.site?.value ? getDomain(b.site.value) : null;
    const yt = b.yt?.value && /^UC[A-Za-z0-9_-]{22}$/.test(b.yt.value) ? b.yt.value : null;
    if (!site && !yt) continue;
    addEntry(map, label, 'wikidata', qid, site, yt);
    count++;
  }
  return count;
}

export class ProtectedNameService {
  static async lookup(q: Queryable, skeleton: string): Promise<ProtectedName | null> {
    if (!skeleton) return null;
    const r = await q.query(`SELECT * FROM protected_names WHERE skeleton = $1 LIMIT 1`, [skeleton]);
    return r.rows[0] ? mapRow(r.rows[0]) : null;
  }

  static async lookupName(name: string): Promise<ProtectedName | null> {
    return this.lookup(getDatabasePool(), confusableSkeleton(name));
  }

  /** Rebuild from both sources. If either source fails, rows are upserted but none are pruned. */
  static async refresh(fetchImpl: typeof fetch = fetch): Promise<{ tranco: number; wikidata: number }> {
    const map = new Map<string, Entry>();
    const startedAt = new Date();
    let tranco = 0;
    let wikidata = 0;
    let complete = true;
    try {
      tranco = await loadTranco(map, fetchImpl);
    } catch (e) {
      complete = false;
      console.warn('[protected-names] Tranco load failed:', e instanceof Error ? e.message : e);
    }
    try {
      wikidata = await loadWikidata(map, fetchImpl);
    } catch (e) {
      complete = false;
      console.warn('[protected-names] Wikidata load failed:', e instanceof Error ? e.message : e);
    }
    const db = getDatabasePool();
    const entries = [...map.values()];
    for (let i = 0; i < entries.length; i += BATCH) {
      const chunk = entries.slice(i, i + BATCH);
      const params: unknown[] = [];
      const values = chunk.map((e) => {
        params.push(e.skeleton, e.display.slice(0, 255), e.source, e.sourceRef, e.requiredDomains, e.requiredYoutubeChannelIds);
        const n = params.length;
        return `($${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}::text[], $${n}::text[], NOW())`;
      });
      await db.query(
        `INSERT INTO protected_names (
           skeleton, display, source, source_ref, required_domains, required_youtube_channel_ids, refreshed_at
         ) VALUES ${values.join(', ')}
         ON CONFLICT (skeleton) DO UPDATE SET
           display = EXCLUDED.display,
           source = EXCLUDED.source,
           source_ref = EXCLUDED.source_ref,
           required_domains = EXCLUDED.required_domains,
           required_youtube_channel_ids = EXCLUDED.required_youtube_channel_ids,
           refreshed_at = NOW()`,
        params
      );
    }
    if (complete && entries.length > 0) {
      await db.query(`DELETE FROM protected_names WHERE refreshed_at < $1`, [startedAt.toISOString()]);
    }
    return { tranco, wikidata };
  }

  private static timer: ReturnType<typeof setInterval> | null = null;

  /** Load once if empty, then weekly. PROTECTED_NAMES_REFRESH=off disables network loads. */
  static start(): void {
    if (this.timer || String(process.env.PROTECTED_NAMES_REFRESH || '').toLowerCase() === 'off') return;
    const run = () =>
      void this.refresh().catch((e) =>
        console.warn('[protected-names] refresh failed:', e instanceof Error ? e.message : e)
      );
    void getDatabasePool()
      .query(`SELECT 1 FROM protected_names LIMIT 1`)
      .then((r) => {
        if (r.rows.length === 0) run();
      })
      .catch(() => undefined);
    this.timer = setInterval(run, REFRESH_INTERVAL_MS);
    this.timer.unref?.();
  }

  static stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** A listed domain or channel proof satisfies the reservation. */
export function proofSatisfiesProtected(
  p: ProtectedName,
  proofType: string,
  proofSubject: string
): boolean {
  if (proofType === 'dns') {
    const registrable = getDomain(proofSubject) ?? proofSubject;
    return p.requiredDomains.includes(proofSubject) || p.requiredDomains.includes(registrable);
  }
  if (proofType === 'youtube') return p.requiredYoutubeChannelIds.includes(proofSubject);
  return false;
}
