import { normalizeCloudIdentityId } from '../sessionMemory.js';
import { deviceConnections } from './connections.js';
import { deviceInbox } from './inbox.js';
import type { DeviceSocialContext } from './socialContext.js';

/** Requester side of a DM re-key: the connection row carries the new KEM ciphertext. */
export async function rekeyConnectionOnDevice(
  ctx: DeviceSocialContext,
  connectionId: string,
  kemCiphertext: string,
  fetchImpl?: typeof fetch
): Promise<boolean> {
  const connections = deviceConnections(ctx, fetchImpl);
  const existing = await connections.get(connectionId);
  if (!existing) return false;
  await connections.upsert({
    ...existing,
    status: 'accepted',
    acceptedAt: existing.acceptedAt || new Date().toISOString(),
    kemCiphertext,
  });
  return true;
}

/** Acceptor side: the DM inbox row carries the message root re-wrapped to the successor key. */
export async function rewrapInboxRootOnDevice(
  ctx: DeviceSocialContext,
  participantPnIdentifier: string,
  connectionId: string,
  wrappedMessageRootKey: string,
  fetchImpl?: typeof fetch
): Promise<boolean> {
  const inbox = deviceInbox(ctx, fetchImpl);
  const peer = normalizeCloudIdentityId(participantPnIdentifier);
  const thread = (await inbox.list()).find(
    (t) => t.threadType === 'dm' && normalizeCloudIdentityId(t.participantPnIdentifier) === peer
  );
  if (!thread) return false;
  await inbox.upsert({ ...thread, connectionId, wrappedMessageRootKey });
  return true;
}
