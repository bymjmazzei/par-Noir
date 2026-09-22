/** Derive a short My Library status label for a local Pen doc. */

import { loadLocalDoc } from './penLocalStore';
import { listLocalSuggestions, readPublishedFileId } from './penAnnotations';
import { listPendingInvites } from './penCollab';

function formatPeerList(peers: string[]): string {
  const shown = peers.slice(0, 3);
  const more = peers.length - shown.length;
  const body = shown.join(', ');
  return more > 0 ? `${body} +${more}` : body;
}

/**
 * Status for explorer rows: unpublished / draft / shared / published / suggestion waiting.
 * Prefer actionable state first when several apply.
 */
export function resolveDocLibraryStatus(pn: string, docId: string): string {
  const bundle = loadLocalDoc(pn, docId);
  const invites = listPendingInvites(docId);
  const pendingSuggestions = listLocalSuggestions(pn, docId).filter(
    (s) => s.status === 'pending'
  );
  const published =
    Boolean(bundle?.manifest.publishedFileId) || Boolean(readPublishedFileId(docId));
  const hasCommit = (bundle?.chain?.links?.length ?? 0) > 0;

  const parts: string[] = [];

  if (pendingSuggestions.length > 0) {
    parts.push(
      pendingSuggestions.length === 1
        ? 'Suggestion waiting'
        : `${pendingSuggestions.length} suggestions waiting`
    );
  }

  if (invites.length > 0) {
    parts.push(`Shared with ${formatPeerList(invites)}`);
  }

  if (published) {
    parts.push('Published to Browse');
  } else if (!hasCommit) {
    parts.push('Unpublished draft');
  } else {
    parts.push('Unpublished');
  }

  // Keep the cell readable: suggestion + share, or publish/unpublish alone with share.
  if (parts.length <= 2) return parts.join(' · ');
  if (pendingSuggestions.length > 0) {
    return [parts[0], invites.length ? parts[1] : parts[parts.length - 1]].join(' · ');
  }
  if (invites.length > 0 && published) {
    return `Shared with ${formatPeerList(invites)} · Published to Browse`;
  }
  return parts[parts.length - 1]!;
}
