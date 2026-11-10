/**
 * Messaging channel ids and inbox table rows. One primary (`platform`) channel
 * plus one per L5 OAuth client; DM inbox rows are unique per (peer, channel).
 */

export const PLATFORM_CHANNEL_CLIENT_ID = 'platform';

export function normalizeChannelClientId(raw: string | undefined | null): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || trimmed === 'browser-app' || trimmed === 'messaging-app') {
    return PLATFORM_CHANNEL_CLIENT_ID;
  }
  return trimmed;
}

export function dmInboxRowKey(participantPnIdentifier: string, channelClientId?: string | null): string {
  const channel = normalizeChannelClientId(channelClientId);
  if (channel === PLATFORM_CHANNEL_CLIENT_ID) {
    return participantPnIdentifier;
  }
  return `${participantPnIdentifier}|${channel}`;
}

export function parseDmInboxRowKey(rowKey: string): { participantPnIdentifier: string; channelClientId: string } {
  const pipe = rowKey.lastIndexOf('|');
  if (pipe <= 0) {
    return { participantPnIdentifier: rowKey, channelClientId: PLATFORM_CHANNEL_CLIENT_ID };
  }
  return {
    participantPnIdentifier: rowKey.slice(0, pipe),
    channelClientId: normalizeChannelClientId(rowKey.slice(pipe + 1)),
  };
}

export interface InboxRow {
  /** Storage key: groupId, peer (legacy/platform), or peer|channel. */
  inboxRowKey?: string;
  threadType?: 'dm' | 'group';
  participantPnIdentifier: string;
  spreadsheetId: string;
  connectionId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  kemCiphertext?: string;
  wrappedMessageRootKey?: string;
  groupId?: string;
  channelClientId?: string;
}

export function normalizeInboxRow(r: InboxRow): InboxRow {
  const threadType = r.threadType ?? 'dm';
  if (threadType === 'group') {
    return {
      ...r,
      threadType: 'group',
      channelClientId: undefined,
      inboxRowKey: r.inboxRowKey || r.groupId || r.participantPnIdentifier,
    };
  }
  const channelClientId = normalizeChannelClientId(r.channelClientId);
  return {
    ...r,
    threadType: 'dm',
    channelClientId,
    inboxRowKey: r.inboxRowKey || dmInboxRowKey(r.participantPnIdentifier, channelClientId),
  };
}

/** Portable conversation ids stored in inbox rows' spreadsheetId column. */
export const PORTABLE_DM_CONVERSATION_PREFIX = 'pn-portable-conv:';
export const PORTABLE_GROUP_CONVERSATION_PREFIX = 'pn-portable-group:';

export function portableGroupConversationId(groupId: string): string {
  return `${PORTABLE_GROUP_CONVERSATION_PREFIX}${groupId}`;
}

export function parsePortableConversationId(
  id: string
): { kind: 'dm'; peerKey: string } | { kind: 'group'; groupId: string } | null {
  if (id.startsWith(PORTABLE_DM_CONVERSATION_PREFIX)) {
    return { kind: 'dm', peerKey: id.slice(PORTABLE_DM_CONVERSATION_PREFIX.length) };
  }
  if (id.startsWith(PORTABLE_GROUP_CONVERSATION_PREFIX)) {
    return { kind: 'group', groupId: id.slice(PORTABLE_GROUP_CONVERSATION_PREFIX.length) };
  }
  return null;
}
