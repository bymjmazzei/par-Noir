/**
 * Operation results returned by the unlock app. The fragment carries ciphertext
 * and public ids only. Key 1 and Key 2 never leave this function's arguments.
 */

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { sealCloudVault } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import type { ShellOp } from './session';

export type ShellUnlocked = {
  publicKey: string;
  decryptedIdentity: Record<string, unknown>;
  encryptedIdentity: Record<string, unknown>;
};

function b64UrlDecode(b64: string): string {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const std = b64.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(std);
}

function identityFile(identity: unknown): string {
  return JSON.stringify(identity);
}

export async function buildShellResult(args: {
  op: ShellOp;
  pnName: string;
  passcode: string;
  unlocked?: ShellUnlocked;
  vaultPayload?: string;
}): Promise<Record<string, string> | undefined> {
  if (args.op === 'seal_vault') {
    if (!args.vaultPayload) throw new Error('Cloud envelope missing');
    const credentials = JSON.parse(b64UrlDecode(args.vaultPayload)) as StorageCredentialsEnvelope;
    const sealed = await sealCloudVault(credentials, args.pnName, args.passcode);
    return { sealedVault: JSON.stringify(sealed) };
  }

  if (args.op === 'create') {
    const created = await IdentityCrypto.createIdentity(args.pnName, args.pnName, args.passcode);
    const session = await IdentityCrypto.authenticateIdentity(created.identity, args.passcode, args.pnName);
    return {
      identityFile: identityFile(created.identity),
      did: session.id,
      publicKey: session.publicKey,
    };
  }

  if (args.op === 'rotate' || args.op === 'recovery') {
    const predecessor = args.unlocked?.decryptedIdentity || {};
    const created = await IdentityCrypto.prepareRotatedIdentity({
      pnName: args.pnName,
      newPasscode: args.passcode,
      predecessorDecrypted: {
        nickname: typeof predecessor.nickname === 'string' ? predecessor.nickname : undefined,
        recoveryEmail: typeof predecessor.recoveryEmail === 'string' ? predecessor.recoveryEmail : undefined,
        recoveryPhone: typeof predecessor.recoveryPhone === 'string' ? predecessor.recoveryPhone : undefined,
      },
    });
    return { identityFile: identityFile(created.identity) };
  }

  if (args.op === 'export') {
    if (!args.unlocked) return undefined;
    return { identityFile: identityFile(args.unlocked.encryptedIdentity) };
  }

  if (args.op === 'sub_pn') {
    return { authorized: '1' };
  }

  if (args.op === 'dm' && args.unlocked) {
    return mlKemResult(args.unlocked);
  }

  if (args.op === 'session') {
    return mlKemResult(args.unlocked);
  }

  return undefined;
}

function mlKemResult(unlocked?: ShellUnlocked): Record<string, string> | undefined {
  if (!unlocked) return undefined;
  const record = unlocked.decryptedIdentity;
  const pqc = record.pqcSecrets as { mlKemSecretKey?: string; mlKemPublicKey?: string } | undefined;
  const mlKemSecretKey =
    pqc?.mlKemSecretKey || (typeof record.mlKemSecretKey === 'string' ? record.mlKemSecretKey : '');
  if (!mlKemSecretKey) return undefined;
  return {
    mlKemSecretKey,
    mlKemPublicKey: pqc?.mlKemPublicKey || '',
  };
}
