/**
 * @jest-environment node
 */
import {
  PLATFORM_CHANNEL_CLIENT_ID,
  CHANNEL_FILTER_ALL,
  normalizeChannelClientId,
  channelClientIdFromOAuthClient,
  parseChannelListFilter,
  dmInboxRowKey,
  isPlatformChannel,
} from './messagingChannel';

describe('messagingChannel', () => {
  it('normalizes first-party client ids to platform', () => {
    expect(normalizeChannelClientId(undefined)).toBe(PLATFORM_CHANNEL_CLIENT_ID);
    expect(normalizeChannelClientId('browser-app')).toBe(PLATFORM_CHANNEL_CLIENT_ID);
    expect(normalizeChannelClientId('messaging-app')).toBe(PLATFORM_CHANNEL_CLIENT_ID);
    expect(normalizeChannelClientId('acme')).toBe('acme');
  });

  it('maps oauth client to channel', () => {
    expect(channelClientIdFromOAuthClient('browser-app')).toBe(PLATFORM_CHANNEL_CLIENT_ID);
    expect(channelClientIdFromOAuthClient('acme')).toBe('acme');
  });

  it('parses list filter', () => {
    expect(parseChannelListFilter(CHANNEL_FILTER_ALL)).toEqual({ mode: 'all' });
    expect(parseChannelListFilter(undefined)).toEqual({
      mode: 'one',
      channelClientId: PLATFORM_CHANNEL_CLIENT_ID,
    });
    expect(parseChannelListFilter('acme')).toEqual({ mode: 'one', channelClientId: 'acme' });
  });

  it('builds dm inbox row keys with platform legacy shape', () => {
    expect(dmInboxRowKey('pn-peer')).toBe('pn-peer');
    expect(dmInboxRowKey('pn-peer', PLATFORM_CHANNEL_CLIENT_ID)).toBe('pn-peer');
    expect(dmInboxRowKey('pn-peer', 'acme')).toBe('pn-peer|acme');
    expect(isPlatformChannel('acme')).toBe(false);
  });
});
