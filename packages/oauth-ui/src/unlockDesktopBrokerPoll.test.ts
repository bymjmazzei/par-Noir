import { describe, expect, it } from 'vitest';
import {
  brokerPollContextFromConsentUrl,
  unlockDesktopBrokerPendingUrl,
} from './unlockDesktopBrokerPoll';

describe('unlockDesktopBrokerPoll', () => {
  it('builds API pending URL with state and client_id', () => {
    const url = unlockDesktopBrokerPendingUrl(
      'https://api.parnoir.com',
      'abc123state',
      'browser-app'
    );
    expect(url).toBe(
      'https://api.parnoir.com/oauth/authorize/broker-pending?state=abc123state&client_id=browser-app'
    );
  });

  it('parses api_endpoint and client_id from consent URL', () => {
    const ctx = brokerPollContextFromConsentUrl(
      'https://unlock.parnoir.com/oauth/consent?client_id=browser-app&api_endpoint=https%3A%2F%2Fapi.parnoir.com&state=s1'
    );
    expect(ctx).toEqual({
      apiEndpoint: 'https://api.parnoir.com',
      clientId: 'browser-app',
    });
  });

  it('returns null when consent URL lacks broker fields', () => {
    expect(brokerPollContextFromConsentUrl('https://unlock.parnoir.com/oauth/consent')).toBeNull();
  });
});
