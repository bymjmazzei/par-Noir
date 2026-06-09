import { deriveMessageKey, encryptDmMessage, decryptDmMessage } from '@par-noir/dm-crypto';
import { rekeyConnectionAsRequester } from './dmRekey';
import type { ConnectionRef, IdentityKeyMaterial } from './types';

export interface MessageRowUpdate {
  rowIndex: number;
  fromPnIdentifier?: string;
  encryptedContent?: string;
}

export interface DmThreadMigrationInput {
  connectionId: string;
  kemCiphertext?: string;
  participantPnIdentifier: string;
  isRequester: boolean;
  rows: Array<{
    rowIndex: number;
    fromPnIdentifier: string;
    encryptedContent: string;
  }>;
}

export interface DmThreadMigrationResult {
  connectionId: string;
  newKemCiphertext?: string;
  legacyMessageRootKey?: string;
  newMessageRootKey: string;
  rowUpdates: MessageRowUpdate[];
}

/**
 * Re-key connection + re-encrypt historical message rows for one DM thread.
 */
export async function migrateDmThreadHistory(
  input: DmThreadMigrationInput,
  predecessor: Pick<IdentityKeyMaterial, 'mlKemSecretKey' | 'mlKemPublicKey' | 'pnIdentifier'>,
  successor: Pick<IdentityKeyMaterial, 'mlKemSecretKey' | 'mlKemPublicKey' | 'pnIdentifier'>
): Promise<DmThreadMigrationResult> {
  const conn: ConnectionRef = {
    connectionId: input.connectionId,
    kemCiphertext: input.kemCiphertext,
    participantPnIdentifier: input.participantPnIdentifier,
    isRequester: input.isRequester,
  };

  const rekey = input.isRequester
    ? rekeyConnectionAsRequester(conn, predecessor, successor)
    : {
        connectionId: input.connectionId,
        newMessageRootKey: '',
        legacyMessageRootKey: undefined as string | undefined,
      };

  let newRoot = rekey.newMessageRootKey;
  let legacyRoot = rekey.legacyMessageRootKey;

  if (!input.isRequester && input.kemCiphertext) {
    const { openDmSession } = await import('@par-noir/dm-crypto');
    try {
      legacyRoot = openDmSession(input.kemCiphertext, predecessor.mlKemSecretKey);
    } catch {
      /* no legacy */
    }
    try {
      newRoot = openDmSession(input.kemCiphertext, successor.mlKemSecretKey);
    } catch {
      newRoot = legacyRoot || '';
    }
  }

  if (!legacyRoot && input.kemCiphertext) {
    const { openDmSession } = await import('@par-noir/dm-crypto');
    try {
      legacyRoot = openDmSession(input.kemCiphertext, predecessor.mlKemSecretKey);
    } catch {
      legacyRoot = newRoot;
    }
  }

  const rowUpdates: MessageRowUpdate[] = [];

  for (const row of input.rows) {
    const update: MessageRowUpdate = { rowIndex: row.rowIndex };
    if (row.fromPnIdentifier === predecessor.pnIdentifier) {
      update.fromPnIdentifier = successor.pnIdentifier;
    }
    if (row.encryptedContent && legacyRoot && newRoot && legacyRoot !== newRoot) {
      try {
        const msgKey = deriveMessageKey(legacyRoot, input.connectionId);
        const plaintext = await decryptDmMessage(row.encryptedContent, msgKey);
        const newMsgKey = deriveMessageKey(newRoot, input.connectionId);
        update.encryptedContent = await encryptDmMessage(plaintext, newMsgKey);
      } catch {
        /* leave ciphertext unchanged */
      }
    }
    if (update.fromPnIdentifier || update.encryptedContent) {
      rowUpdates.push(update);
    }
  }

  return {
    connectionId: input.connectionId,
    newKemCiphertext: rekey.newKemCiphertext,
    legacyMessageRootKey: legacyRoot,
    newMessageRootKey: newRoot,
    rowUpdates,
  };
}

export interface MigrationReportItem {
  path: string;
  fileId?: string;
  outcome: 'migrated' | 'patched' | 'failed' | 'skipped';
  reason?: string;
}

export interface MigrationReport {
  migrationId: string;
  predecessorPnIdentifier: string;
  successorPnIdentifier: string;
  counts: { migrated: number; patched: number; failed: number; skipped: number };
  items: MigrationReportItem[];
  completedAt: string;
}

export function createEmptyMigrationReport(
  migrationId: string,
  predecessorPn: string,
  successorPn: string
): MigrationReport {
  return {
    migrationId,
    predecessorPnIdentifier: predecessorPn,
    successorPnIdentifier: successorPn,
    counts: { migrated: 0, patched: 0, failed: 0, skipped: 0 },
    items: [],
    completedAt: new Date().toISOString(),
  };
}

export function recordMigrationOutcome(
  report: MigrationReport,
  item: MigrationReportItem
): MigrationReport {
  const counts = { ...report.counts };
  counts[item.outcome]++;
  return {
    ...report,
    counts,
    items: [...report.items, item],
  };
}
