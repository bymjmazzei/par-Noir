import { describe, it, expect } from 'vitest';
import {
  encryptDriveFilePackage,
  decryptDriveFilePackage,
  reencryptDriveFilePackage,
} from '../src/driveFiles';
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
