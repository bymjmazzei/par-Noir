/**
 * Messaging channel ids: one primary (`platform`) + per-L5 OAuth client_id threads.
 * Peer connection index stays one row; Inbox uniqueness is (connectionId, channelClientId) for DMs.
 */

import { isFirstPartyClient } from './integratorStoragePaths';

/** Primary / default channel used by browse + messaging first-party surfaces. */
export const PLATFORM_CHANNEL_CLIENT_ID = 'platform';

export function normalizeChannelClientId(raw: string | undefined | null): string {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed || trimmed === 'browser-app' || trimmed === 'messaging-app') {
    return PLATFORM_CHANNEL_CLIENT_ID;
  }
  return trimmed;
}

export function isPlatformChannel(channelClientId: string | undefined | null): boolean {
  return normalizeChannelClientId(channelClientId) === PLATFORM_CHANNEL_CLIENT_ID;
}

/**
 * Map an OAuth access-token clientId to the messaging channel that surface should use.
 * First-party clients → platform; L5 clients → their client_id.
 */
export function channelClientIdFromOAuthClient(oauthClientId: string | undefined | null): string {
  const id = typeof oauthClientId === 'string' ? oauthClientId.trim() : '';
  if (!id || isFirstPartyClient(id)) {
    return PLATFORM_CHANNEL_CLIENT_ID;
  }
  return id;
}

/** Aggregator list sentinel (messaging app only): all channels. */
export const CHANNEL_FILTER_ALL = '*';

export function parseChannelListFilter(
  raw: string | undefined | null
): { mode: 'all' } | { mode: 'one'; channelClientId: string } {
  if (raw === CHANNEL_FILTER_ALL) {
    return { mode: 'all' };
  }
  return { mode: 'one', channelClientId: normalizeChannelClientId(raw) };
}

/** Portable / sheets uniqueness helper for DM inbox rows. */
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
