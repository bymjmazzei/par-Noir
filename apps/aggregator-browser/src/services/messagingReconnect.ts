/**
 * Allows messaging UI to trigger OAuth re-unlock when ML-KEM session is missing.
 */

let reconnectHandler: (() => void) | null = null;

export function registerMessagingReconnect(handler: () => void): () => void {
  reconnectHandler = handler;
  return () => {
    if (reconnectHandler === handler) {
      reconnectHandler = null;
    }
  };
}

export function requestMessagingReconnect(): void {
  reconnectHandler?.();
}

export function isMessagingKeysError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('messaging keys') ||
    (lower.includes('messaging') && (lower.includes('unlock') || lower.includes('passcode')))
  );
}
