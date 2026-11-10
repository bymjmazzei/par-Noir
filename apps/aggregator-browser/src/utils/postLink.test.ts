import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.fn(() => false);
const nativeShare = vi.fn(async (_options: unknown): Promise<void> => undefined);
const copyToClipboard = vi.fn(async (_text: string): Promise<boolean> => true);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }));
vi.mock('@capacitor/share', () => ({ Share: { share: (o: unknown) => nativeShare(o) } }));
vi.mock('./clipboard', () => ({ copyToClipboard: (t: string) => copyToClipboard(t) }));

import { postShareUrl, sharePostLink } from './postLink';
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

describe('sharePostLink', () => {
  it('copies on desktop even when Web Share exists', async () => {
    const webShare = vi.fn(async () => undefined);
    stubBrowser({ coarse: false, webShare });
    await expect(sharePostLink(file)).resolves.toBe('copied');
    expect(copyToClipboard).toHaveBeenCalledWith('https://pn.parnoir.com/?creator=pn-d8f74864&file=abc123');
    expect(webShare).not.toHaveBeenCalled();
  });

  it('uses the share sheet on touch devices and reports cancel', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const webShare = vi.fn(async () => {
      throw abort;
    });
    stubBrowser({ coarse: true, webShare });
    await expect(sharePostLink(file)).resolves.toBe('cancelled');
    expect(copyToClipboard).not.toHaveBeenCalled();
  });

  it('uses the native sheet in the app', async () => {
    isNativePlatform.mockReturnValue(true);
    stubBrowser({ coarse: false });
    await expect(sharePostLink(file)).resolves.toBe('shared');
    expect(nativeShare).toHaveBeenCalled();
  });

  it('reports failed when the clipboard write fails', async () => {
    copyToClipboard.mockResolvedValue(false);
    stubBrowser({ coarse: false });
    await expect(sharePostLink(file, 'copy')).resolves.toBe('failed');
  });
});
