/**
 * Cache peer mailbox route keys so conversation decrypt/poll does not re-list connections.
 */

const routeByConnectionId = new Map<string, string>();
const routeByPeerPn = new Map<string, string>();

function normPn(pn: string): string {
  const t = (pn || '').trim();
  if (!t) return '';
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function cachePeerMailboxRouteKey(opts: {
  connectionId?: string;
  peerPnIdentifier?: string;
  peerMailboxRouteKey: string;
}): void {
  const key = (opts.peerMailboxRouteKey || '').trim();
  if (!key) return;
  const connectionId = (opts.connectionId || '').trim();
  if (connectionId) routeByConnectionId.set(connectionId, key);
  const peer = normPn(opts.peerPnIdentifier || '');
  if (peer) routeByPeerPn.set(peer, key);
}

export function getCachedPeerMailboxRouteKey(opts: {
  connectionId?: string;
  peerPnIdentifier?: string;
}): string | undefined {
  const connectionId = (opts.connectionId || '').trim();
  if (connectionId) {
    const hit = routeByConnectionId.get(connectionId);
    if (hit) return hit;
  }
  const peer = normPn(opts.peerPnIdentifier || '');
  if (peer) return routeByPeerPn.get(peer);
  return undefined;
}

export function clearPeerMailboxRouteKeyCache(): void {
  routeByConnectionId.clear();
  routeByPeerPn.clear();
}
