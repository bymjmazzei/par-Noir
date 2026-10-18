/**
 * Guard for Pen button links on aggregator rows. The client runs the same checkLink;
 * this is the server copy plus Google Safe Browsing, which the client cannot call.
 * Sealed private docs never reach the server, so they are not checked here.
 */

import {
  checkLink,
  docToPlainText,
  LINK_BLOCK_MESSAGES,
  secretPromptLayers,
  type PenPageLayer,
  type PenSectionContent,
  type PenTipTapNode
} from '@par-noir/pen-protocol';
import type { Response } from 'express';

export type PublicLinkGuardFailure = {
  status: 400 | 503;
  error: 'unsafe_link' | 'secret_prompt' | 'link_check_unavailable';
  error_description: string;
};

type FoundLink = { raw: string; face: string };

const SAFE_BROWSING_ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const SAFE_BROWSING_BATCH = 500;
const MAX_WALK_DEPTH = 12;

let warnedMissingKey = false;

function faceOf(node: Record<string, unknown>): string {
  const label = typeof node.label === 'string' ? node.label : '';
  const doc = node.textDoc && typeof node.textDoc === 'object' ? (node.textDoc as PenTipTapNode) : undefined;
  return `${docToPlainText(doc)} ${label}`;
}

function walk(
  value: unknown,
  depth: number,
  links: FoundLink[],
  layerSets: PenPageLayer[][]
): void {
  if (depth > MAX_WALK_DEPTH || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, depth + 1, links, layerSets);
    return;
  }
  const node = value as Record<string, unknown>;
  if (typeof node.openUrl === 'string' && node.openUrl.trim()) {
    links.push({ raw: node.openUrl, face: faceOf(node) });
  }
  if (Array.isArray(node.layers)) {
    layerSets.push(
      node.layers.filter((l): l is PenPageLayer => Boolean(l) && typeof l === 'object' && 'id' in l)
    );
  }
  for (const child of Object.values(node)) walk(child, depth + 1, links, layerSets);
}

function asksForSecret(layers: PenPageLayer[]): boolean {
  const section: PenSectionContent = { slug: 'guard', doc: { type: 'doc', content: [] }, layers };
  const groups = new Set<string | null>([null]);
  for (const layer of layers) if (layer.parentGroupId) groups.add(layer.parentGroupId);
  return [...groups].some((groupId) => secretPromptLayers(section, groupId).length > 0);
}

async function safeBrowsingMatches(urls: string[], apiKey: string): Promise<string[]> {
  const flagged: string[] = [];
  for (let i = 0; i < urls.length; i += SAFE_BROWSING_BATCH) {
    const batch = urls.slice(i, i + SAFE_BROWSING_BATCH);
    const res = await fetch(`${SAFE_BROWSING_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'parnoir', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: [
            'MALWARE',
            'SOCIAL_ENGINEERING',
            'UNWANTED_SOFTWARE',
            'POTENTIALLY_HARMFUL_APPLICATION'
          ],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: batch.map((url) => ({ url }))
        }
      })
    });
    if (!res.ok) throw new Error(`safe_browsing_${res.status}`);
    const body = (await res.json()) as { matches?: Array<{ threat?: { url?: string } }> };
    for (const match of body.matches || []) {
      if (match.threat?.url) flagged.push(match.threat.url);
    }
  }
  return flagged;
}

/** Null when every Pen link on the row may be shown to viewers. */
export async function checkPublicLinks(
  metadata: unknown,
  apiKey: string | undefined = process.env.GOOGLE_SAFE_BROWSING_API_KEY
): Promise<PublicLinkGuardFailure | null> {
  const links: FoundLink[] = [];
  const layerSets: PenPageLayer[][] = [];
  walk(metadata, 0, links, layerSets);

  if (layerSets.some(asksForSecret)) {
    return {
      status: 400,
      error: 'secret_prompt',
      error_description: 'A form on this post asks viewers for a passcode, password, or other secret.'
    };
  }

  const urls: string[] = [];
  for (const link of links) {
    const verdict = checkLink(link.raw, link.face);
    if (!verdict.ok) {
      return {
        status: 400,
        error: 'unsafe_link',
        error_description: LINK_BLOCK_MESSAGES[verdict.reason]
      };
    }
    if (!urls.includes(verdict.url)) urls.push(verdict.url);
  }
  if (!urls.length) return null;

  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('[publicLinkGuard] GOOGLE_SAFE_BROWSING_API_KEY unset; skipping Safe Browsing');
    }
    return null;
  }
  let flagged: string[];
  try {
    flagged = await safeBrowsingMatches(urls, apiKey);
  } catch (err) {
    console.warn('[publicLinkGuard] Safe Browsing failed:', err instanceof Error ? err.message : err);
    return {
      status: 503,
      error: 'link_check_unavailable',
      error_description: 'Could not check links right now. Try again.'
    };
  }
  if (flagged.length) {
    return {
      status: 400,
      error: 'unsafe_link',
      error_description: 'A link on this post is listed as phishing or malware.'
    };
  }
  return null;
}

/** Writes the failure and returns true when the request must stop. */
export async function rejectUnsafePublicLinks(
  res: Response,
  metadata: unknown,
  requestId?: string
): Promise<boolean> {
  const failure = await checkPublicLinks(metadata);
  if (!failure) return false;
  res.status(failure.status).json({
    error: failure.error,
    error_description: failure.error_description,
    ...(requestId ? { requestId } : {})
  });
  return true;
}
