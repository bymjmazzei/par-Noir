import type { EncryptedIdentity } from '@par-noir/identity-crypto';

type RecoveryEnvelope = NonNullable<EncryptedIdentity['recoveryEnvelope']>;

/** Recovery envelope from the current shell unlock. Unlock keeps the .pn; lock clears this. */
const envelopes = new Map<string, RecoveryEnvelope>();

function parseEnvelope(raw: string): RecoveryEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RecoveryEnvelope>;
    if (parsed?.version === 1 && typeof parsed.iv === 'string' && typeof parsed.ciphertext === 'string') {
      return parsed as RecoveryEnvelope;
    }
  } catch {
    /* fall through */
  }
  console.warn('[recovery] Unlock returned an unreadable recovery envelope');
  return null;
}

export function rememberShellRecoveryEnvelope(ids: Array<string | null | undefined>, raw: string): void {
  const envelope = raw ? parseEnvelope(raw) : null;
  if (!envelope) return;
  for (const id of ids) {
    if (id) envelopes.set(id, envelope);
  }
}

export function readShellRecoveryEnvelope(id: string | null | undefined): RecoveryEnvelope | null {
  if (!id) return null;
  return envelopes.get(id) || null;
}

export function clearShellRecoveryEnvelope(): void {
  envelopes.clear();
}
