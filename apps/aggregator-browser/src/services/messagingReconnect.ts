/**
 * Allows messaging UI to trigger OAuth re-unlock when ML-KEM session is missing.
 */

import { isDmIdentityReady } from './dmIdentitySession';
import { invalidateUserProfileCache } from './profileService';

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

export function isRequesterPublicKeyMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('no messaging public key') || lower.includes('messaging public key on file');
}

const REQUESTER_KEY_MESSAGE =
  'The person who sent this request needs to unlock their pN with their identity file so their messaging key is published.';

const LOCAL_KEYS_MESSAGE =
  'Messaging keys unavailable. Lock and unlock your pN again to accept connections.';

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Failed to accept connection request';
}

/** Pre-check before accept: returns message if local keys missing, else null. */
export function ensureLocalMessagingKeysForAccept(
  setLocalError?: (msg: string) => void
): string | null {
  if (isDmIdentityReady()) return null;
  const message = LOCAL_KEYS_MESSAGE;
  setLocalError?.(message);
  requestMessagingReconnect();
  return message;
}

/**
 * Normalize accept failures, trigger reconnect when appropriate, surface message.
 */
export function reportConnectionAcceptError(
  error: unknown,
  setLocalError?: (msg: string) => void,
  options?: { requesterPnIdentifier?: string }
): string {
  let message = normalizeErrorMessage(error);

  if (isRequesterPublicKeyMissingError(message)) {
    message = REQUESTER_KEY_MESSAGE;
    if (options?.requesterPnIdentifier) {
      invalidateUserProfileCache(options.requesterPnIdentifier);
    }
  } else if (isMessagingKeysError(message)) {
    requestMessagingReconnect();
  }

  setLocalError?.(message);
  return message;
}
