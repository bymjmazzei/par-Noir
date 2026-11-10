/**
 * Send a post link to connections as DMs.
 */

import type { IndexedFile } from '../types/aggregator';
import { sendMessage } from '../services/messageService';
import { postShareUrl } from './postLink';

export interface SharePostDmResult {
  sent: string[];
  failed: { pn: string; error: string }[];
}

export function postDmContent(file: IndexedFile, note: string): string {
  const url = postShareUrl(file);
  const trimmed = note.trim();
  return trimmed ? `${trimmed}\n${url}` : url;
}

export async function sendPostToConnections(
  fromPn: string,
  toPns: string[],
  file: IndexedFile,
  note: string
): Promise<SharePostDmResult> {
  const content = postDmContent(file, note);
  const results = await Promise.allSettled(toPns.map((pn) => sendMessage(fromPn, pn, content)));
  const out: SharePostDmResult = { sent: [], failed: [] };
  results.forEach((r, i) => {
    const pn = toPns[i];
    if (r.status === 'fulfilled') out.sent.push(pn);
    else out.failed.push({ pn, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
  });
  return out;
}
