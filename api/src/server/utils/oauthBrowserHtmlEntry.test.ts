import type express from 'express';
import { isOAuthBrowserHtmlEntryGet } from './oauthBrowserHtmlEntry';

function mockReq(method: string, pathOrUrl: string): express.Request {
  const path = pathOrUrl.split('?')[0];
  return { method, path, url: pathOrUrl } as express.Request;
}

describe('isOAuthBrowserHtmlEntryGet', () => {
  it('allows GET consent entry paths without Origin', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/authorize/consent'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/authorize/consent?x=1'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/consent'))).toBe(true);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/consent?client_id=foo'))).toBe(true);
  });

  it('allows GET popup-bridge (OAuth handoff after consent in popup)', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/popup-bridge'))).toBe(true);
    expect(
      isOAuthBrowserHtmlEntryGet(
        mockReq('GET', '/oauth/popup-bridge?code=abc&state=def&redirect_uri=https%3A%2F%2Fpn.parnoir.com%2Foauth-callback.html&client_id=browser-app')
      )
    ).toBe(true);
  });

  it('rejects non-GET', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('POST', '/oauth/popup-bridge'))).toBe(false);
  });

  it('rejects unrelated paths', () => {
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/oauth/token'))).toBe(false);
    expect(isOAuthBrowserHtmlEntryGet(mockReq('GET', '/api/profile/foo'))).toBe(false);
  });
});
