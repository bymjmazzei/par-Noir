import { describe, expect, it } from 'vitest';
import { downloadFileName, parseAccountKey } from './accounts';
import type { OwnerFileRow } from './model';
import { isAllowedFeedMediaSignedUrl, penDocUrl, publicMediaPath } from './publicMedia';

describe('isAllowedFeedMediaSignedUrl', () => {
  it('allows R2 and feed-media hosts', () => {
    expect(
      isAllowedFeedMediaSignedUrl(
        'https://0f8a70c0e2c03ad9bdbeb34082f9c2cd.r2.cloudflarestorage.com/pn-feed-previews/x'
      )
    ).toBe(true);
    expect(isAllowedFeedMediaSignedUrl('https://feed-media.parnoir.com/x')).toBe(true);
  });

  it('rejects non-https and foreign hosts', () => {
    expect(isAllowedFeedMediaSignedUrl('http://feed-media.parnoir.com/x')).toBe(false);
    expect(isAllowedFeedMediaSignedUrl('https://evil.example/x')).toBe(false);
    expect(isAllowedFeedMediaSignedUrl('not-a-url')).toBe(false);
  });
});

describe('url + key helpers', () => {
  it('builds public-media and Pen doc URLs', () => {
    expect(publicMediaPath('a b', 'poster')).toBe('/api/aggregator/public-media/a%20b?variant=poster');
    expect(penDocUrl('doc-1')).toBe('https://pen.parnoir.com/d/doc-1');
  });

  it('parses account keys', () => {
    expect(parseAccountKey('google_drive::account-1')).toEqual({ provider: 'google_drive', accountId: 'account-1' });
    expect(parseAccountKey('dropbox')).toEqual({ provider: 'dropbox', accountId: '' });
  });

  it('picks a download name that keeps its extension', () => {
    const row = { displayName: 'photo', name: 'photo.jpg.encrypted' } as OwnerFileRow;
    expect(downloadFileName(row)).toBe('photo.jpg');
    expect(downloadFileName({ ...row, displayName: 'doc.pdf', name: 'doc.encrypted' })).toBe('doc.pdf');
  });
});
