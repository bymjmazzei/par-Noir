import { clearDmThreadSessions } from '@par-noir/dm-crypto';

const legacyRootKeys = new Map<string, string>();

export function setLegacyMessageRootKey(connectionId: string, messageRootKeyB64: string): void {
  legacyRootKeys.set(connectionId, messageRootKeyB64);
}

export function getLegacyMessageRootKey(connectionId: string): string | undefined {
  return legacyRootKeys.get(connectionId);
}

/** @deprecated No-op for live path — sessions live in dm-crypto registry. */
export function setMessageRootKey(_connectionId: string, _messageRootKeyB64: string): void {}

/** @deprecated */
export function getMessageRootKey(_connectionId: string): string | undefined {
  return undefined;
}

export function clearDmSessionCache(): void {
  legacyRootKeys.clear();
  clearDmThreadSessions();
}
