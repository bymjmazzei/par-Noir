import { CONNECTIONS_SCHEMA, FOLLOWERS_SCHEMA, portableGroupConversationId } from '@par-noir/user-owned-storage';
import { normalizeCloudIdentityId } from '../sessionMemory.js';
import { deviceConnections } from './connections.js';
import { deviceConversation, resolveDmConversation, type DeviceConversationMessage } from './conversations.js';
import { deviceGroups, type GroupKeyRotation } from './groups.js';
import { deviceInbox } from './inbox.js';
import { socialReceipt, type TablesSocialContext } from './socialContext.js';

type Body = Record<string, unknown>;

const text = (body: Body, key: string): string | undefined =>
  typeof body[key] === 'string' && body[key] ? (body[key] as string) : undefined;

const pnOf = (raw: string | undefined): string => (raw ? normalizeCloudIdentityId(raw) : '');

function messageFrom(body: Body, from: string, to: string | undefined, read: boolean): DeviceConversationMessage {
  return {
    messageId: text(body, 'messageId') || '',
    fromPnIdentifier: from,
    ...(to ? { toPnIdentifier: to } : {}),
    content: '',
    encryptedContent: text(body, 'encryptedContent') || '',
    timestamp: text(body, 'timestamp') || new Date().toISOString(),
    read,
    cryptoVersion: 2,
    ...(text(body, 'mediaFileId')
      ? {
          mediaFileId: text(body, 'mediaFileId'),
          mediaBackend: text(body, 'mediaBackend'),
          mediaMimeType: text(body, 'mediaMimeType'),
        }
      : {}),
  };
}

async function appendDm(ctx: TablesSocialContext, identityId: string, peer: string, body: Body, read: boolean, fromSelf: boolean) {
  const conversationId = await resolveDmConversation(ctx, {
    identityId,
    peerPnIdentifier: peer || undefined,
    connectionId: text(body, 'connectionId'),
    channelClientId: text(body, 'channelClientId'),
  });
  const me = normalizeCloudIdentityId(identityId);
  await deviceConversation(ctx, conversationId).append(
    messageFrom(body, fromSelf ? me : peer, fromSelf ? peer || undefined : me, read)
  );
  return socialReceipt(ctx, { spreadsheetId: conversationId, ...(peer ? { peerPnIdentifier: peer } : {}) });
}

async function appendGroupMessage(ctx: TablesSocialContext, body: Body, read: boolean) {
  const groupId = text(body, 'groupId');
  if (!groupId) throw new Error('group_message_append requires groupId');
  const conversationId = portableGroupConversationId(groupId);
  await deviceConversation(ctx, conversationId).append(messageFrom(body, pnOf(text(body, 'fromPnIdentifier')), undefined, read));
  return socialReceipt(ctx, { spreadsheetId: conversationId });
}

async function applyGroupInboxUpdate(ctx: TablesSocialContext, body: Body) {
  const groupId = text(body, 'groupId');
  if (!groupId) throw new Error('group_inbox_update requires groupId');
  const groups = deviceGroups(ctx);
  const inbox = deviceInbox(ctx);
  const existing = (await groups.list()).filter((r) => r.groupId === groupId);

  if (body.removed === true) {
    await groups.rewrap(groupId, existing[0]?.ownerPnIdentifier || '', []);
    await inbox.remove((t) => t.threadType === 'group' && (t.groupId || t.participantPnIdentifier) === groupId);
    return socialReceipt(ctx, { groupId });
  }

  const rotation = Array.isArray(body.keyRotation) ? (body.keyRotation as GroupKeyRotation) : null;
  if (rotation) {
    await groups.rewrap(groupId, existing[0]?.ownerPnIdentifier || pnOf(text(body, 'ownerPnIdentifier')), rotation);
    return socialReceipt(ctx, { groupId });
  }

  const owner = pnOf(text(body, 'ownerPnIdentifier')) || existing[0]?.ownerPnIdentifier || '';
  const title = text(body, 'title') || existing[0]?.title || '';
  const createdAt = existing[0]?.createdAt || text(body, 'createdAt') || new Date().toISOString();
  const members = Array.isArray(body.members) ? (body.members as GroupKeyRotation) : [];
  for (const m of members) {
    await groups.upsert({
      groupId,
      ownerPnIdentifier: owner,
      title,
      createdAt,
      memberPnIdentifier: pnOf(m.memberPnIdentifier),
      accessRole: m.accessRole,
      wrappedChatKey: m.wrappedChatKey,
    });
  }
  await inbox.upsert({
    threadType: 'group',
    groupId,
    participantPnIdentifier: groupId,
    spreadsheetId: portableGroupConversationId(groupId),
    connectionId: '',
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: text(body, 'preview'),
  });
  return socialReceipt(ctx, { groupId });
}

/**
 * Land one inbound mailbox job in a non-Google social cloud. Returns the
 * deviceCloudResult receipt, or null for job types this cloud cannot hold
 * (pen docs live on Google Drive) so the job stays in the mailbox.
 */
export async function applyInboundJobToTables(
  ctx: TablesSocialContext,
  identityId: string,
  jobType: string,
  body: Body
): Promise<Body | null> {
  const peer = pnOf(text(body, 'peerPnIdentifier') || text(body, 'fromPnIdentifier') || text(body, 'requesterPnIdentifier'));
  const connectionId = text(body, 'connectionId') || text(body, 'requestId') || '';
  const connections = deviceConnections(ctx);

  switch (jobType) {
    case 'message_append':
      return appendDm(ctx, identityId, pnOf(text(body, 'fromPnIdentifier')), body, false, false);
    case 'group_message_append':
      return appendGroupMessage(ctx, body, false);
    case 'group_inbox_update':
      return applyGroupInboxUpdate(ctx, body);
    case 'connection_request':
    case 'connection_accept': {
      if (!peer || !connectionId) return connections.receipt({ peerPnIdentifier: peer });
      const accepted = jobType === 'connection_accept';
      const kemCiphertext = text(body, 'kemCiphertext');
      await connections.upsert({
        connectionId,
        userPnIdentifier: peer,
        status: accepted ? 'accepted' : 'pending_received',
        createdAt: text(body, 'createdAt') || new Date().toISOString(),
        acceptedAt: accepted ? new Date().toISOString() : undefined,
        peerMlKemPublicKey: text(body, 'peerMlKemPublicKey'),
        kemCiphertext,
        peerMailboxRouteKey: text(body, 'peerMailboxRouteKey') || text(body, 'acceptorMailboxRouteKey'),
      });
      if (accepted) {
        await resolveDmConversation(ctx, {
          identityId,
          peerPnIdentifier: peer,
          connectionId,
          kemCiphertext,
          wrappedMessageRootKey: text(body, 'wrappedMessageRootKey'),
          channelClientId: text(body, 'channelClientId'),
        });
      }
      return connections.receipt({ peerPnIdentifier: peer, connectionId });
    }
    case 'connection_reject':
    case 'connection_delete': {
      if (connectionId) await (await ctx.tables.openTable(CONNECTIONS_SCHEMA)).delete(connectionId);
      return connections.receipt({ peerPnIdentifier: peer, connectionId });
    }
    case 'follower_add': {
      if (peer) {
        await (await ctx.tables.openTable(FOLLOWERS_SCHEMA)).append({
          followerPnIdentifier: peer,
          followedAt: new Date().toISOString(),
        });
      }
      return socialReceipt(ctx, { peerPnIdentifier: peer });
    }
    case 'follower_remove': {
      if (peer) await (await ctx.tables.openTable(FOLLOWERS_SCHEMA)).delete(peer);
      return socialReceipt(ctx, { peerPnIdentifier: peer });
    }
    default:
      return null;
  }
}

/** The sender's own copy of an outbox record on a non-Google social cloud. */
export async function applyOwnOutboxToTables(
  ctx: TablesSocialContext,
  identityId: string,
  kind: string,
  body: Body
): Promise<Body | null> {
  if (kind === 'message_append') {
    const peer = pnOf(text(body, 'toPnIdentifier'));
    if (!peer) throw new Error('message_append outbox record has no recipient');
    return appendDm(ctx, identityId, peer, body, true, true);
  }
  if (kind === 'group_message_append') return appendGroupMessage(ctx, body, true);
  return null;
}
