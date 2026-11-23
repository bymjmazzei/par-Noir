/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  stashPreferAppBrokerWait,
  readPreferAppBrokerWait,
  clearPreferAppBrokerWait,
  stashPreferAppBrokerWaitFromConsentUrl,
  beginPreferAppBrokerPollLive,
  endPreferAppBrokerPollLive,
  isPreferAppBrokerPollLive,
  PN_PREFER_APP_BROKER_WAIT_KEY,
} from './preferAppBrokerWait';

describe('preferAppBrokerWait', () => {
  beforeEach(() => {
    clearPreferAppBrokerWait();
    while (isPreferAppBrokerPollLive()) endPreferAppBrokerPollLive();
  });
  afterEach(() => {
    clearPreferAppBrokerWait();
    while (isPreferAppBrokerPollLive()) endPreferAppBrokerPollLive();
  });

  it('stashes and reads wait', () => {
    stashPreferAppBrokerWait({
      state: 'abcdefghij',
      clientId: 'messaging-app',
      apiEndpoint: 'https://api.parnoir.com',
    });
    const w = readPreferAppBrokerWait();
    expect(w?.state).toBe('abcdefghij');
    expect(w?.clientId).toBe('messaging-app');
    expect(w?.apiEndpoint).toBe('https://api.parnoir.com');
  });

  it('stashes from consent url', () => {
    stashPreferAppBrokerWaitFromConsentUrl(
      'https://unlock.parnoir.com/oauth/consent?client_id=messaging-app&api_endpoint=https%3A%2F%2Fapi.parnoir.com&state=statestatestate'
    );
    const w = readPreferAppBrokerWait();
    expect(w?.clientId).toBe('messaging-app');
    expect(w?.state).toBe('statestatestate');
  });

  it('expires stale waits', () => {
    localStorage.setItem(
      PN_PREFER_APP_BROKER_WAIT_KEY,
      JSON.stringify({
        v: 1,
        state: 'abcdefghij',
        clientId: 'messaging-app',
        apiEndpoint: 'https://api.parnoir.com',
        startedAt: Date.now() - 200_000,
      })
    );
    expect(readPreferAppBrokerWait()).toBeNull();
  });

  it('tracks live prefer-app broker polls', () => {
    expect(isPreferAppBrokerPollLive()).toBe(false);
    beginPreferAppBrokerPollLive();
    beginPreferAppBrokerPollLive();
    expect(isPreferAppBrokerPollLive()).toBe(true);
    endPreferAppBrokerPollLive();
    expect(isPreferAppBrokerPollLive()).toBe(true);
    endPreferAppBrokerPollLive();
    expect(isPreferAppBrokerPollLive()).toBe(false);
  });
});
