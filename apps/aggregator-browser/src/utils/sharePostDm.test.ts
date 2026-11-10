import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessage = vi.fn(async (_from: string, _to: string, _content: string): Promise<void> => undefined);

vi.mock('../services/messageService', () => ({
  sendMessage: (from: string, to: string, content: string) => sendMessage(from, to, content),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));
vi.mock('./clipboard', () => ({ copyToClipboard: vi.fn() }));

vi.stubGlobal('window', { location: { origin: 'https://pn.parnoir.com', pathname: '/' } });

import { postDmContent, sendPostToConnections } from './sharePostDm';
import type { IndexedFile } from '../types/aggregator';

const file = {
  pnIdentifier: 'pn-d8f74864',
  metadata: { fileId: 'abc123', title: 'Test' },
} as unknown as IndexedFile;
const url = 'https://pn.parnoir.com/?creator=pn-d8f74864&file=abc123';

beforeEach(() => {
  sendMessage.mockReset();
  sendMessage.mockResolvedValue(undefined);
});

describe('postDmContent', () => {
  it('is just the link without a note', () => {
    expect(postDmContent(file, '   ')).toBe(url);
  });

  it('puts the note above the link', () => {
    expect(postDmContent(file, ' look at this ')).toBe(`look at this\n${url}`);
  });
});

describe('sendPostToConnections', () => {
  it('sends the same content to each recipient and reports failures per recipient', async () => {
    sendMessage.mockImplementation(async (_from, to) => {
      if (to === 'pn-bad') throw new Error('No encrypted session for this conversation.');
    });
    const result = await sendPostToConnections('pn-me', ['pn-a', 'pn-bad', 'pn-b'], file, 'hi');
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(sendMessage).toHaveBeenCalledWith('pn-me', 'pn-a', `hi\n${url}`);
    expect(result.sent).toEqual(['pn-a', 'pn-b']);
    expect(result.failed).toEqual([{ pn: 'pn-bad', error: 'No encrypted session for this conversation.' }]);
  });
});
