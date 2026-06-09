import { describe, it, expect } from 'vitest';
import {
  encryptDriveFilePackage,
  decryptDriveFilePackage,
  reencryptDriveFilePackage,
} from '../src/driveFiles';
import { migrateDriveEncryptedFiles } from '../src/driveFileMigration';
import {
  patchProfileJson,
  replaceIdentityStringsInJson,
  isEncryptedPayloadFileName,
} from '../src/driveMetadataPatch';
import { createEmptyMigrationReport, recordMigrationOutcome } from '../src/dmHistoryMigration';
import { buildMigrationPlan, allRequiredStepsComplete } from '../src/catalog';
import { markStepComplete, createInitialProgress } from '../src/runner';
import { rekeyConnectionAsRequester } from '../src/dmRekey';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

describe('driveFiles', () => {
  it('reencrypts roundtrip with new identity keys', async () => {
    const old = { did: 'did:key:old', publicKey: 'pk-old-abc' };
    const neu = { did: 'did:key:new', publicKey: 'pk-new-xyz' };
    const data = new TextEncoder().encode('hello migration');
    const pkg = await encryptDriveFilePackage(data, old, { originalName: 'test.txt' });
    const migrated = await reencryptDriveFilePackage(pkg, old, neu);
    const out = await decryptDriveFilePackage(migrated, neu);
    expect(new TextDecoder().decode(out)).toBe('hello migration');
    expect(migrated.metadata?.originalName).toBe('test.txt');
  });
});

describe('catalog + runner', () => {
  it('builds plan with canonical pn ids', async () => {
    const plan = await buildMigrationPlan({
      predecessorPublicKey: 'pred-pk',
      successorPublicKey: 'succ-pk',
      predecessorDid: 'did:key:pred',
      successorDid: 'did:key:succ',
    });
    expect(plan.predecessorPnIdentifier).toMatch(/^pn-[a-f0-9]{12}$/);
    expect(plan.successorPnIdentifier).toMatch(/^pn-[a-f0-9]{12}$/);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('tracks step completion', async () => {
    const plan = await buildMigrationPlan({
      predecessorPublicKey: 'a',
      successorPublicKey: 'b',
      predecessorDid: 'did:a',
      successorDid: 'did:b',
    });
    let progress = createInitialProgress(plan.migrationId);
    for (const step of plan.steps) {
      progress = markStepComplete(progress, step.id);
    }
    expect(allRequiredStepsComplete(plan, progress.completedStepIds)).toBe(true);
  });
});

describe('driveFileMigration', () => {
  it('migrates encrypted files via callbacks', async () => {
    const old = { did: 'did:key:old', publicKey: 'pk-old' };
    const neu = { did: 'did:key:new', publicKey: 'pk-new' };
    const data = new TextEncoder().encode('payload');
    const pkg = await encryptDriveFilePackage(data, old);
    const stored = new Map<string, string>([['f1', JSON.stringify(pkg)]]);

    const result = await migrateDriveEncryptedFiles(old, neu, {
      listEncryptedFiles: async () => [{ fileId: 'f1', fileName: 'a.encrypted' }],
      download: async (id) => stored.get(id)!,
      uploadReencrypted: async (id, json) => {
        stored.set(id, json);
      },
      onProgress: () => {},
    });

    expect(result.migrated).toBe(1);
    const migrated = JSON.parse(stored.get('f1')!);
    const out = await decryptDriveFilePackage(migrated, neu);
    expect(new TextDecoder().decode(out)).toBe('payload');
  });
});

describe('driveMetadataPatch', () => {
  it('patches profile identifier', () => {
    const patched = patchProfileJson({ identifier: 'pn-abc' }, 'pn-def', 'kem-b64');
    expect(patched.identifier).toBe('pn-def');
    expect(patched.mlKemPublicKey).toBe('kem-b64');
  });

  it('replaces pn strings in nested json', () => {
    const out = replaceIdentityStringsInJson(
      { owner: { id: 'pn-aaa111111111' }, tags: ['pn-aaa111111111'] },
      'pn-aaa111111111',
      'pn-bbb222222222'
    ) as { owner: { id: string } };
    expect(out.owner.id).toBe('pn-bbb222222222');
  });

  it('detects encrypted file names', () => {
    expect(isEncryptedPayloadFileName('photo.jpg.encrypted')).toBe(true);
    expect(isEncryptedPayloadFileName('profile.json')).toBe(false);
  });
});

describe('migration report', () => {
  it('records outcomes', () => {
    let report = createEmptyMigrationReport('mig_1', 'pn-a', 'pn-b');
    report = recordMigrationOutcome(report, { path: '/a', outcome: 'migrated' });
    expect(report.counts.migrated).toBe(1);
  });
});

describe('dmRekey', () => {
  it('self-rekeys requester connection', () => {
    const oldKem = ml_kem768.keygen();
    const newKem = ml_kem768.keygen();
    const oldPk = bytesToB64(oldKem.publicKey);
    const oldSk = bytesToB64(oldKem.secretKey);
    const newPk = bytesToB64(newKem.publicKey);
    const newSk = bytesToB64(newKem.secretKey);

    const { kemCiphertext } = (() => {
      const { cipherText, sharedSecret } = ml_kem768.encapsulate(oldKem.publicKey);
      return {
        kemCiphertext: bytesToB64(cipherText),
        messageRootKey: bytesToB64(sharedSecret),
      };
    })();

    const result = rekeyConnectionAsRequester(
      { connectionId: 'c1', kemCiphertext, participantPnIdentifier: 'pn-other', isRequester: true },
      { mlKemSecretKey: oldSk, mlKemPublicKey: oldPk },
      { mlKemSecretKey: newSk, mlKemPublicKey: newPk }
    );
    expect(result.newKemCiphertext).toBeTruthy();
    expect(result.newMessageRootKey).toBeTruthy();
    expect(result.legacyMessageRootKey).toBeTruthy();
  });
});
