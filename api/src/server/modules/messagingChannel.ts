/**
 * Messaging channel ids: one primary (`platform`) + per-L5 OAuth client_id threads.
 * Peer connection index stays one row; Inbox uniqueness is (connectionId, channelClientId) for DMs.
 */

import {
  PLATFORM_CHANNEL_CLIENT_ID,
  normalizeChannelClientId,
  dmInboxRowKey,
  parseDmInboxRowKey,
} from '@par-noir/user-owned-storage';
import { isFirstPartyClient } from './integratorStoragePaths';

export { PLATFORM_CHANNEL_CLIENT_ID, normalizeChannelClientId, dmInboxRowKey, parseDmInboxRowKey };

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
