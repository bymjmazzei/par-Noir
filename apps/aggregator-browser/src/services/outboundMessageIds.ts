/**
 * Client-side registry of messageIds we just sent.
 * Server fans new_message to sender + recipient with opaque ciphertext (no from field).
 * Inbound preview must skip these or they paint as peer-authored echoes.
 */

const OUTBOUND_TTL_MS = 120_000;
const recentOutboundIds = new Map<string, number>();

function prune(now: number): void {
  for (const [id, at] of recentOutboundIds) {
    if (now - at > OUTBOUND_TTL_MS) recentOutboundIds.delete(id);
  }
}

export function rememberOutboundMessageId(messageId: string): void {
  const id = (messageId || '').trim();
  if (!id) return;
  const now = Date.now();
  prune(now);
  recentOutboundIds.set(id, now);
}

export function isRecentOutboundMessageId(messageId: string): boolean {
  const id = (messageId || '').trim();
  if (!id) return false;
  const at = recentOutboundIds.get(id);
  if (at == null) return false;
  if (Date.now() - at > OUTBOUND_TTL_MS) {
    recentOutboundIds.delete(id);
    return false;
  }
  return true;
}

/** Test-only. */
export function clearOutboundMessageIdsForTests(): void {
  recentOutboundIds.clear();
}
