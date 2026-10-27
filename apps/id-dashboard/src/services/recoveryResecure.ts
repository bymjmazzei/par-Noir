/**
 * Re-secure recovery: new master secret, envelope and split, then a new relay epoch so every
 * custodian gets a fresh share. Needed for pNs set up before the relay (their old workbook held
 * encrypted shares) and after revoking a custodian (who still holds a valid old share).
 */
import {
  combineShares,
  decryptRecoveryEnvelope,
  encryptRecoveryEnvelope,
  generateRecoveryMaster,
  normalizeShare,
  sealRecoveryShares,
  splitSecret,
  type RecoveryEnvelope,
} from '@par-noir/recovery-crypto';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  deleteLegacyRecoveryWorkbook,
  getCloudAccessTokenFromSession,
  readLegacyRecoveryRoster,
} from '@par-noir/device-cloud-credentials';
import {
  fetchRecoveryCustodianSummary,
  registerRecoveryFailsafe,
  setupRecoveryEpoch,
} from './recoveryApiService';
import { setRecoveryAuthSession, type RecoveryAuthSession } from './recoveryAuthSession';
import { resolveRecoveryShares } from './recoveryShareResolver';
import { assignCustodianVaultAndIssueCredential } from './recoveryCustodianSetup';

const RESPLIT_FLAG_PREFIX = 'pn_recovery_resplit_';
const MAX_TOTAL_SHARES = 5;

export function markRecoveryResplitRequired(pnIdentifier: string): void {
  localStorage.setItem(`${RESPLIT_FLAG_PREFIX}${pnIdentifier}`, '1');
}

export function isRecoveryResplitRequired(pnIdentifier: string): boolean {
  return localStorage.getItem(`${RESPLIT_FLAG_PREFIX}${pnIdentifier}`) === '1';
}

/** True when the owner's Drive still has the pre-relay recovery workbook. */
export async function hasLegacyRecoveryWorkbook(pnIdentifier: string): Promise<boolean> {
  const accessToken = getCloudAccessTokenFromSession(pnIdentifier);
  if (!accessToken) return false;
  return Boolean(await readLegacyRecoveryRoster({ accessToken, pnIdentifier }));
}

async function persistLocalIdentity(identity: EncryptedIdentity): Promise<void> {
  const simpleStorage = (await import('../utils/simpleStorage')).SimpleStorage.getInstance();
  const stored = (await simpleStorage.getIdentities()).find((i) => i.publicKey === identity.publicKey);
  if (!stored) {
    console.warn('[recovery] re-secured identity is not in local storage; download the updated .pn');
    return;
  }
  await simpleStorage.updateIdentity({
    ...stored,
    encryptedData: {
      ...(stored.encryptedData as EncryptedIdentity),
      recoveryEnvelope: identity.recoveryEnvelope,
      recoverySharesSealed: identity.recoverySharesSealed,
    },
  });
}

export async function resecureRecovery(params: {
  authToken: string;
  pnIdentifier: string;
  identityId: string;
  auth: RecoveryAuthSession;
  threshold: number;
}): Promise<{ encryptedIdentity: EncryptedIdentity; invited: number }> {
  const { auth, authToken, pnIdentifier } = params;
  const { pnName, passcode } = auth;
  const oldEnvelope = auth.encryptedIdentity.recoveryEnvelope as RecoveryEnvelope | undefined;
  if (!oldEnvelope) throw new Error('This pN has no recovery envelope. Download a fresh .pn and unlock with it.');

  const oldShares = await resolveRecoveryShares({
    encryptedIdentity: auth.encryptedIdentity,
    pnName,
    passcode,
  });
  const payload = await decryptRecoveryEnvelope(
    combineShares(oldShares.map((s) => normalizeShare(s))),
    oldEnvelope
  );
  if (payload.publicKey !== auth.encryptedIdentity.publicKey) {
    throw new Error('Recovery envelope does not match this pN.');
  }

  const summary = await fetchRecoveryCustodianSummary(pnIdentifier, authToken);
  const totalShares = MAX_TOTAL_SHARES;
  const threshold = Math.min(Math.max(params.threshold, 2), totalShares);

  const master = generateRecoveryMaster();
  const recoveryEnvelope = await encryptRecoveryEnvelope(master, {
    ...payload,
    recoveryConfig: { threshold, totalShares, version: 1, createdAt: new Date().toISOString() },
  });
  const shares = splitSecret(master, threshold, totalShares);
  const recoverySharesSealed = await sealRecoveryShares(shares, pnName, passcode);
  const encryptedIdentity: EncryptedIdentity = {
    ...auth.encryptedIdentity,
    recoveryEnvelope,
    recoverySharesSealed,
  };

  await persistLocalIdentity(encryptedIdentity);
  await registerRecoveryFailsafe(authToken, {
    userPnIdentifier: pnIdentifier,
    publicKey: encryptedIdentity.publicKey,
    envelope: recoveryEnvelope,
  });
  await setupRecoveryEpoch(authToken, {
    ownerPublicKey: encryptedIdentity.publicKey,
    threshold,
    totalShares,
    rotate: true,
  });
  setRecoveryAuthSession({ ...auth, encryptedIdentity });
  localStorage.removeItem(`${RESPLIT_FLAG_PREFIX}${pnIdentifier}`);

  let invited = 0;
  const accessToken = getCloudAccessTokenFromSession(pnIdentifier);
  const legacy = accessToken ? await readLegacyRecoveryRoster({ accessToken, pnIdentifier }) : null;
  if (legacy && accessToken) {
    const onRelay = new Set((summary?.custodians || []).map((c) => c.custodianId));
    for (const c of legacy.custodians) {
      if (onRelay.has(c.custodianId)) continue;
      await assignCustodianVaultAndIssueCredential({
        custodianId: c.custodianId,
        custodianName: c.name || c.custodianId,
        custodianType: c.custodianType || 'person',
        identityId: params.identityId,
        encryptedIdentity,
        invitationId: `inv-resecure-${Date.now()}-${invited}`,
        threshold,
        apiToken: authToken,
        userPnIdentifier: pnIdentifier,
        unrevokable: c.unrevokable === true,
        pnName,
        passcode,
      });
      invited += 1;
    }
    await deleteLegacyRecoveryWorkbook({ accessToken, pnIdentifier, workbookId: legacy.workbookId });
  }
  return { encryptedIdentity, invited };
}
