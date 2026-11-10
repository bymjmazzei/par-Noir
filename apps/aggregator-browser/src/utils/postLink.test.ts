import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn(() => false);
const nativeShare = vi.fn(async (_options: unknown): Promise<void> => undefined);
const copyToClipboard = vi.fn(async (_text: string): Promise<boolean> => true);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock('@capacitor/share', () => ({ Share: { share: (o: unknown) => nativeShare(o) } }));
vi.mock('./clipboard', () => ({ copyToClipboard: (t: string) => copyToClipboard(t) }));

import { canOpenShareSheet, parsePostLink, postShareUrl, sharePostLink } from './postLink';
import type { IndexedFile } from '../types/aggregator';

const file = {
  pnIdentifier: 'pn-d8f74864',
  metadata: { fileId: 'abc123', title: 'Test Test' },
} as unknown as IndexedFile;

function stubBrowser({ coarse, webShare }: { coarse: boolean; webShare?: (o: unknown) => Promise<void> }) {
  vi.stubGlobal('window', {
    location: { origin: 'https://pn.parnoir.com', pathname: '/' },
    matchMedia: () => ({ matches: coarse }),
  });
  vi.stubGlobal('navigator', webShare ? { share: webShare } : {});
}

beforeEach(() => {
  isNativePlatform.mockReturnValue(false);
  nativeShare.mockClear();
  copyToClipboard.mockClear();
  copyToClipboard.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postShareUrl', () => {
  it('names the creator and the post', () => {
    expect(postShareUrl(file, 'https://pn.parnoir.com/')).toBe(
      'https://pn.parnoir.com/?creator=pn-d8f74864&file=abc123'
    );
  });

  it('omits creator when the post has none', () => {
    const anon = { metadata: { fileId: 'x' } } as unknown as IndexedFile;
    expect(postShareUrl(anon, 'https://a/')).toBe('https://a/?file=x');
  });
});

describe('parsePostLink', () => {
  const origin = 'https://pn.parnoir.com';

  it('reads creator and file from a same-origin post link', () => {
    expect(parsePostLink(`${origin}/?creator=pn-d8f74864&file=abc123`, origin)).toEqual({
      creator: 'pn-d8f74864',
      fileId: 'abc123',
    });
    expect(parsePostLink(`${origin}/?file=abc123`, origin)).toEqual({ fileId: 'abc123' });
  });

  it('rejects other origins, links without a file, and non-URLs', () => {
    expect(parsePostLink('https://evil.example/?creator=a&file=b', origin)).toBeNull();
    expect(parsePostLink(`${origin}/?creator=a`, origin)).toBeNull();
    expect(parsePostLink('not a url', origin)).toBeNull();
  });
});

describe('canOpenShareSheet', () => {
  it('is false on a desktop browser without Web Share', () => {
    stubBrowser({ coarse: false });
    expect(canOpenShareSheet()).toBe(false);
  });

  it('is true with Web Share or in the native app', () => {
    stubBrowser({ coarse: false, webShare: async () => undefined });
    expect(canOpenShareSheet()).toBe(true);
    vi.unstubAllGlobals();
    stubBrowser({ coarse: false });
    isNativePlatform.mockReturnValue(true);
    expect(canOpenShareSheet()).toBe(true);
  });
});

describe('sharePostLink', () => {
  it('copy mode copies the canonical link and never opens the sheet', async () => {
    const webShare = vi.fn(async () => undefined);
    stubBrowser({ coarse: true, webShare });
    await expect(sharePostLink(file, 'copy')).resolves.toBe('copied');
    expect(copyToClipboard).toHaveBeenCalledWith('https://pn.parnoir.com/?creator=pn-d8f74864&file=abc123');
    expect(webShare).not.toHaveBeenCalled();
  });

  it('sheet mode uses Web Share and reports cancel', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const webShare = vi.fn(async () => {
      throw abort;
    });
    stubBrowser({ coarse: false, webShare });
    await expect(sharePostLink(file, 'sheet')).resolves.toBe('cancelled');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('sheet mode uses the native sheet in the app', async () => {
    isNativePlatform.mockReturnValue(true);
    stubBrowser({ coarse: false });
    await expect(sharePostLink(file, 'sheet')).resolves.toBe('shared');
    expect(nativeShare).toHaveBeenCalled();
  });

  it('sheet mode fails without a share sheet instead of silently copying', async () => {
    stubBrowser({ coarse: false });
    await expect(sharePostLink(file, 'sheet')).resolves.toBe('failed');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('reports failed when the clipboard write fails', async () => {
    copyToClipboard.mockResolvedValue(false);
    stubBrowser({ coarse: false });
    await expect(sharePostLink(file, 'copy')).resolves.toBe('failed');
  });
});
