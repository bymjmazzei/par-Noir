import { beforeEach, expect, test, vi } from 'vitest';

const listDeviceMessages = vi.fn();
const decryptIncomingMessage = vi.fn();

vi.mock('@par-noir/device-cloud-credentials', () => ({
  listDeviceMessages: (...args: unknown[]) => listDeviceMessages(...args),
  createOutboxRecord: vi.fn(),
  messageSendFanout: vi.fn(),
  promoteLocalOutbox: vi.fn(),
  promoteOutboxRecord: vi.fn(),
  upsertLocalOutboxRecord: vi.fn(),
  requireOnlineCloudForSend: vi.fn(),
}));

vi.mock('./sessionDrive', () => ({
  sessionDriveFor: async () => ({ accessToken: 'google-token', index: {} }),
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
  listDeviceMessages.mockReset();
  decryptIncomingMessage.mockReset();
  listDeviceMessages.mockResolvedValue([
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

test('a thread opened from its spreadsheet decrypts the sheet rows', async () => {
  const result = await getConversationMessages(
    'pn-self',
    'pn-peer',
    50,
    0,
    'conn-1',
    'kem',
    'sheet-1'
  );
  expect(listDeviceMessages).toHaveBeenCalledWith('google-token', 'sheet-1');
  expect(decryptIncomingMessage).toHaveBeenCalled();
  expect(result.messages[0]?.content).toBe('hello');
});
