/**
 * @jest-environment node
 *
 * Gate: L5 product message routes stay first-party; channel filter helpers stay fail-closed.
 */
import {
  PLATFORM_CHANNEL_CLIENT_ID,
  CHANNEL_FILTER_ALL,
  normalizeChannelClientId,
  parseChannelListFilter,
  isPlatformChannel,
} from './messagingChannel';
import { L5_PRODUCT_ROUTE_PREFIXES } from './l5ProductRouteBoundary';

describe('messaging channel threads gate', () => {
  it('keeps /api/messages in the first-party product boundary', () => {
    expect(L5_PRODUCT_ROUTE_PREFIXES).toContain('/api/messages');
    expect(L5_PRODUCT_ROUTE_PREFIXES).toContain('/api/connections');
  });

  it('defaults missing channel to platform (legacy Inbox rows)', () => {
    expect(normalizeChannelClientId('')).toBe(PLATFORM_CHANNEL_CLIENT_ID);
    expect(isPlatformChannel(undefined)).toBe(true);
  });

  it('treats aggregator * as all-channels mode only', () => {
    expect(parseChannelListFilter(CHANNEL_FILTER_ALL).mode).toBe('all');
    expect(parseChannelListFilter('acme')).toEqual({
      mode: 'one',
      channelClientId: 'acme',
    });
  });

  it('does not treat L5 client ids as platform', () => {
    expect(isPlatformChannel('acme')).toBe(false);
    expect(normalizeChannelClientId('acme')).toBe('acme');
  });
});
