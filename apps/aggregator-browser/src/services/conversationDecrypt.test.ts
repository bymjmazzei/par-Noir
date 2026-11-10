import { beforeEach, expect, test, vi } from 'vitest';

const listConversation = vi.fn();
const deviceConversation = vi.fn();
const resolveDmConversation = vi.fn();
const decryptIncomingMessage = vi.fn();
const socialCtx = { kind: 'google_drive', accessToken: 'google-token', index: {} };

vi.mock('@par-noir/device-cloud-credentials', () => ({
  deviceConversation: (...args: unknown[]) => deviceConversation(...args),
  resolveDmConversation: (...args: unknown[]) => resolveDmConversation(...args),
  createOutboxRecord: vi.fn(),
  messageSendFanout: vi.fn(),
  promoteLocalOutbox: vi.fn(),
  promoteOutboxRecord: vi.fn(),
  upsertLocalOutboxRecord: vi.fn(),
  requireOnlineCloudForSend: vi.fn(),
}));

vi.mock('./sessionSocial', () => ({
  sessionSocialFor: async () => socialCtx,
}));

vi.mock('./dmCryptoClient', () => ({
  decryptIncomingMessage: (...args: unknown[]) => decryptIncomingMessage(...args),
  encryptOutgoingMessage: vi.fn(),
  UNABLE_TO_DECRYPT_MESSAGE: '[Unable to decrypt message]',
}));

vi.mock('./connectionService', () => ({
  getConnections: async () => [],
}));

import { getConversationMessages } from './messageService';

beforeEach(() => {
  listConversation.mockReset();
  deviceConversation.mockReset().mockImplementation(() => ({ list: listConversation }));
  resolveDmConversation.mockReset().mockResolvedValue('own-sheet');
  decryptIncomingMessage.mockReset();
  listConversation.mockResolvedValue([
    {
      fromPnIdentifier: 'pn-peer',
      content: 'ciphertext-body',
      encryptedContent: 'ciphertext-body',
      timestamp: '2026-01-01T00:00:00.000Z',
      messageId: 'm1',
      read: false,
      cryptoVersion: 2,
    },
  ]);
  decryptIncomingMessage.mockResolvedValue('hello');
});

test('a thread reads from its own resolved dm conversation, not the inbox-supplied id, and decrypts the rows', async () => {
  const result = await getConversationMessages(
    'pn-self',
    'pn-peer',
    50,
    0,
    'conn-1',
    'kem',
    'peer-sheet'
  );
  expect(resolveDmConversation).toHaveBeenCalledWith(
    socialCtx,
    expect.objectContaining({ identityId: 'pn-self', peerPnIdentifier: 'pn-peer', connectionId: 'conn-1' })
  );
  expect(deviceConversation).toHaveBeenCalledWith(socialCtx, 'own-sheet');
  expect(decryptIncomingMessage).toHaveBeenCalled();
  expect(result.messages[0]?.content).toBe('hello');
});
