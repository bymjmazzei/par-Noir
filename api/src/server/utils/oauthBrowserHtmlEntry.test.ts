import type express from 'express';
import { isOAuthBrowserHtmlEntryGet, isOAuthConsentSameOriginGet } from './oauthBrowserHtmlEntry';

function mockReq(
  method: string,
  pathOrUrl: string,
  headers: Record<string, string> = {}
): express.Request {
  const path = pathOrUrl.split('?')[0];
  return { method, path, url: pathOrUrl, headers } as express.Request;
}

describe('isOAuthBrowserHtmlEntryGet', () => {
  it('allows GET consent entry paths without Origin', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/authorize/consent'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/authorize/consent?x=1'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/consent'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/consent?client_id=foo'))).toBe(true);
  });

  it('allows GET deprecated popup-bridge path (no-Origin GETs; handler returns 410)', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/popup-bridge'))).toBe(true);
    expect(
      isOAuthBrowserHtmlEntryGet(
        mockReq(
          'GET',
          '/oauth/popup-bridge?code=abc&state=def&redirect_uri=https%3A%2F%2Fpn.parnoir.com%2Foauth-callback.html&client_id=browser-app'
        )
      )
    ).toBe(true);
  });

  it('rejects non-GET on popup-bridge', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('POST', '/oauth/popup-bridge'))).toBe(false);
  });

  it('rejects unrelated paths', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/token'))).toBe(false);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/api/profile/foo'))).toBe(false);
  });
});

describe('isOAuthConsentSameOriginGet', () => {
  it('allows same-origin GET grant poll and catalog', () => {
    expect(
      isOAuthConsentSameOriginGet(
        mockReq('GET', '/oauth/existing-grant?pnIdentifier=pn-x&client_id=browser-app', {
          'sec-fetch-site': 'same-origin',
        })
      )
    ).toBe(true);
    expect(
      isOAuthConsentSameOriginGet(
        mockReq('GET', '/api/v1/standard-data-points', { 'sec-fetch-site': 'same-origin' })
      )
    ).toBe(true);
  });

  it('rejects cross-site or missing Sec-Fetch-Site', () => {
    expect(isOAuthConsentSameOriginGet(mockReq('GET', '/oauth/existing-grant'))).toBe(false);
    expect(
      isOAuthConsentSameOriginGet(
        mockReq('GET', '/oauth/existing-grant', { 'sec-fetch-site': 'cross-site' })
      )
    ).toBe(false);
  });

  it('rejects POST and unrelated paths', () => {
    expect(
      isOAuthConsentSameOriginGet(
        mockReq('POST', '/oauth/existing-grant', { 'sec-fetch-site': 'same-origin' })
      )
    ).toBe(false);
    expect(
      isOAuthConsentSameOriginGet(
        mockReq('GET', '/oauth/token', { 'sec-fetch-site': 'same-origin' })
      )
    ).toBe(false);
  });
});
