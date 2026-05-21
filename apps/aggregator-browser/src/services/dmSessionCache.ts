/**
 * In-memory DM session keys (never persisted).
 */

const rootKeys = new Map<string, string>();

export function setMessageRootKey(connectionId: string, messageRootKeyB64: string): void {
  rootKeys.set(connectionId, messageRootKeyB64);
}

export function getMessageRootKey(connectionId: string): string | undefined {
  return rootKeys.get(connectionId);
}

export function clearDmSessionCache(): void {
  rootKeys.clear();
}
