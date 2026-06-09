/**
 * In-memory DM session keys (never persisted).
 * Legacy roots from identity migration are loaded from localStorage migration state only.
 */

const rootKeys = new Map<string, string>();
const legacyRootKeys = new Map<string, string>();

export function setMessageRootKey(connectionId: string, messageRootKeyB64: string): void {
  rootKeys.set(connectionId, messageRootKeyB64);
}

export function getMessageRootKey(connectionId: string): string | undefined {
  return rootKeys.get(connectionId);
}

export function setLegacyMessageRootKey(connectionId: string, messageRootKeyB64: string): void {
  legacyRootKeys.set(connectionId, messageRootKeyB64);
}

export function getLegacyMessageRootKey(connectionId: string): string | undefined {
  return legacyRootKeys.get(connectionId);
}

export function clearDmSessionCache(): void {
  rootKeys.clear();
  legacyRootKeys.clear();
}
