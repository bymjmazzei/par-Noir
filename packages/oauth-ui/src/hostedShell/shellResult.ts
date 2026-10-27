/**
 * Operation results returned by the unlock app. The fragment carries ciphertext
 * and public ids only. Key 1 and Key 2 never leave this function's arguments.
 */

import { IdentityCrypto } from '@par-noir/identity-crypto';
import { sealCloudVault } from '@par-noir/device-cloud-credentials';
import type { StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import type { ShellOp } from './session';
import { createAgentIdentity, type SaveAgentIdentity } from './agentIdentity';
import { decodeAgentDelegationDraft, signAgentDelegation } from './agentDelegation';
import { extractMlDsaSecretKeyB64, type DecryptedIdentityRecord } from '../consentUnlock/extractMlDsa';

export type ShellUnlocked = {
  /** Vault identityId of the unlocked pN. */
  did?: string;
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
  agentLabel?: string;
  /** op=agent: base64url draft from the dashboard (scopes and yes/no attestations). */
  agentDelegation?: string;
  saveAgentIdentity?: SaveAgentIdentity;
}): Promise<Record<string, string> | undefined> {
  if (args.op === 'agent') {
    if (!args.unlocked) throw new Error('Unlock your pN to add an AI agent');
    const draft = decodeAgentDelegationDraft(args.agentDelegation);
    if (!draft) throw new Error('Choose what this AI agent may do in the dashboard first');
    const rootSecret = extractMlDsaSecretKeyB64(args.unlocked.decryptedIdentity as DecryptedIdentityRecord);
    if (!rootSecret || !args.unlocked.publicKey) throw new Error('Unlock your pN to add an AI agent');
    const ownerIdentityId =
      args.unlocked.did ||
      (typeof args.unlocked.decryptedIdentity.id === 'string' ? args.unlocked.decryptedIdentity.id : '');
    const agent = await createAgentIdentity({
      label: args.agentLabel || '',
      ownerIdentityId,
      saveAgentIdentity: args.saveAgentIdentity,
    });
    const signed = signAgentDelegation({
      draft,
      rootPublicKey: args.unlocked.publicKey,
      agentPnIdentifier: agent.agentPnIdentifier,
      agentPublicKey: agent.agentPublicKey,
      rootMlDsaSecretKeyB64: rootSecret,
    });
    return {
      agentPnIdentifier: agent.agentPnIdentifier,
      agentPublicKey: agent.agentPublicKey,
      statement: JSON.stringify(signed.statement),
      signature: signed.signature,
    };
  }

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
    return sessionResult(args.unlocked);
  }

  return undefined;
}

/** The dashboard registers recovery keys with the envelope; Unlock keeps the rest of the .pn. */
function sessionResult(unlocked?: ShellUnlocked): Record<string, string> | undefined {
  const result: Record<string, string> = { ...(mlKemResult(unlocked) || {}) };
  const envelope = unlocked?.encryptedIdentity.recoveryEnvelope;
  if (envelope && typeof envelope === 'object') {
    result.recoveryEnvelope = JSON.stringify(envelope);
  }
  return Object.keys(result).length > 0 ? result : undefined;
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
