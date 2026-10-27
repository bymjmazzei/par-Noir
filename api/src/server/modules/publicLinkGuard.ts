/**
 * Guard for Pen button links on aggregator rows. The client runs the same checkLink;
 * this is the server copy plus Google Web Risk, which the client cannot call.
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

const WEB_RISK_ENDPOINT = 'https://webrisk.googleapis.com/v1/uris:search';
const WEB_RISK_THREATS = [
  'MALWARE',
  'SOCIAL_ENGINEERING',
  'UNWANTED_SOFTWARE',
  'SOCIAL_ENGINEERING_EXTENDED_COVERAGE'
];
/** Web Risk bills per lookup, one URL each. */
const MAX_CHECKED_LINKS = 25;
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

async function webRiskMatches(urls: string[], apiKey: string): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url) => {
      const params = new URLSearchParams({ uri: url, key: apiKey });
      for (const threat of WEB_RISK_THREATS) params.append('threatTypes', threat);
      const res = await fetch(`${WEB_RISK_ENDPOINT}?${params}`);
      if (!res.ok) throw new Error(`web_risk_${res.status}`);
      const body = (await res.json()) as { threat?: { threatTypes?: string[] } };
      return body.threat?.threatTypes?.length ? url : null;
    })
  );
  return results.filter((url): url is string => url !== null);
}

/** Null when every Pen link on the row may be shown to viewers. */
export async function checkPublicLinks(
  metadata: unknown,
  apiKey: string | undefined = process.env.GOOGLE_WEB_RISK_API_KEY
): Promise<PublicLinkGuardFailure | null> {
  const links: FoundLink[] = [];
  const layerSets: PenPageLayer[][] = [];
  walk(metadata, 0, links, layerSets);

  if (layerSets.some(asksForSecret)) {
    return {
      status: 400,
      error: 'secret_prompt',
      error_description: 'A form on this post asks viewers for a key, password, or other secret.'
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
  if (urls.length > MAX_CHECKED_LINKS) {
    return {
      status: 400,
      error: 'unsafe_link',
      error_description: `A post can link to at most ${MAX_CHECKED_LINKS} different addresses.`
    };
  }

  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('[publicLinkGuard] GOOGLE_WEB_RISK_API_KEY unset; skipping Web Risk');
    }
    return null;
  }
  let flagged: string[];
  try {
    flagged = await webRiskMatches(urls, apiKey);
  } catch (err) {
    console.warn('[publicLinkGuard] Web Risk failed:', err instanceof Error ? err.message : err);
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
