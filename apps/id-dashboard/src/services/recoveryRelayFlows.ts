/**
 * Recovery on the device. Custodian mode: owner seals shares to custodians, custodians keep
 * them on their own Drive and re-seal to the claimant's one-time key, the claimant opens them.
 * Key-only mode: the claimant proves the owner's Google account and receives data only the
 * recovery key opens. The API only relays sealed data; nothing here sends a Drive token to it.
 */
import {
  custodyAad,
  generateRecoveryKeyPair,
  openSealedShare,
  parseSealedShare,
  recoveryPublicKeyFromSecret,
  recoveryRequestIdFor,
  releaseAad,
  sealShareToKey,
  serializeSealedShare,
  type KeyRecoveryEnvelope,
  type RecoveryEnvelope,
  type RecoveryKeyPair,
  type RecoveryZkApprovalPayload,
  type ShamirShare,
} from '@par-noir/recovery-crypto';
import {
  createRecoveryDriveProofSecret,
  findRecoveryCustody,
  getCloudAccessTokenFromSession,
  readRecoveryDriveProof,
  recoveryDriveProofHash,
  writeRecoveryCustody,
  writeRecoveryDriveProof,
} from '@par-noir/device-cloud-credentials';
import { SecureCredentialManager, type EncryptedIdentity } from '@par-noir/identity-crypto';
import {
  ackCustodyDeliveries,
  fetchCustodyDeliveries,
  hashRecoveryKey,
  releaseKeyRecovery,
  releaseRecoveryShares,
  sendCustodyDelivery,
  startRecoveryWithFailsafeKey,
  submitRecoveryApproval,
  type CustodianRecoveryRequest,
  type RecoveryCustodianApiRow,
  type RecoveryCustodianSummary,
} from './recoveryApiService';
import { resolveIdentityMlKemSecret } from './resolveIdentityMlKem';
import { issueRecoveryApprovalZkp } from './recoveryZkService';

const TEMP_KEY_PREFIX = 'pn_recovery_tmpkey_';

/** ML-KEM key pair of the unlocked identity (custodian side). */
export async function loadIdentityRecoveryKeys(
  identityId: string,
  publicKey?: string | null
): Promise<RecoveryKeyPair> {
  const creds = SecureCredentialManager.getCredentials(identityId);
  if (!creds?.pnName || !creds.passcode) {
    throw new Error('Unlock your pN to act as a custodian.');
  }
  const secretKey = await resolveIdentityMlKemSecret({
    identityId,
    publicKey,
    pnName: creds.pnName,
    passcode: creds.passcode,
  });
  if (!secretKey) throw new Error('This pN has no encryption key for recovery shares.');
  return { publicKey: recoveryPublicKeyFromSecret(secretKey), secretKey };
}

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

export function lowestFreeShareIndex(
  shares: ShamirShare[],
  summary: RecoveryCustodianSummary | null
): number | null {
  const used = new Set(
    (summary?.custodians || []).filter((c) => c.status !== 'revoked').map((c) => c.shareIndex)
  );
  const free = shares.map((s) => s.index).filter((i) => !used.has(i)).sort((a, b) => a - b);
  return free[0] ?? null;
}

export function custodiansAwaitingShare(summary: RecoveryCustodianSummary | null): RecoveryCustodianApiRow[] {
  return (summary?.custodians || []).filter(
    (c) => c.status === 'accepted' && Boolean(c.mlKemPublicKey) && !c.custodyCurrent && !c.custodyPending
  );
}

/** Seal each accepted custodian's share to their published key and hand it to the relay. */
export async function sendPendingCustody(params: {
  authToken: string;
  ownerPublicKey: string;
  shares: ShamirShare[];
  summary: RecoveryCustodianSummary | null;
}): Promise<number> {
  const epoch = params.summary?.epoch;
  if (!params.summary?.configured || epoch == null) return 0;
  let sent = 0;
  for (const c of custodiansAwaitingShare(params.summary)) {
    const share = params.shares.find((s) => s.index === c.shareIndex);
    if (!share) throw new Error(`Share #${c.shareIndex} is not in this pN's recovery material.`);
    const sealed = await sealShareToKey(
      share,
      c.mlKemPublicKey!,
      custodyAad({ ownerPublicKey: params.ownerPublicKey, custodianId: c.custodianId, shareIndex: c.shareIndex, epoch })
    );
    await sendCustodyDelivery(params.authToken, c.custodianId, { epoch, sealedShare: serializeSealedShare(sealed) });
    sent += 1;
  }
  return sent;
}

/** Owner Drive keeps the secret a claimant must read back; the API stores only a digest. */
export async function ensureRecoveryDriveProof(pnIdentifier: string): Promise<string> {
  const accessToken = getCloudAccessTokenFromSession(pnIdentifier);
  if (!accessToken) throw new Error('Connect Google Drive under Storage before creating a recovery key.');
  let secret = await readRecoveryDriveProof({ accessToken, pnIdentifier });
  if (!secret) {
    secret = createRecoveryDriveProofSecret();
    await writeRecoveryDriveProof({ accessToken, pnIdentifier, secret });
  }
  return recoveryDriveProofHash(secret);
}

// ---------------------------------------------------------------------------
// Custodian
// ---------------------------------------------------------------------------

/** Store delivered shares on the custodian's own Drive, then ack. Unopenable deliveries stay unacked. */
export async function syncCustodianCustody(params: {
  authToken: string;
  custodianPn: string;
  custodianIdentityId: string;
  custodianPublicKey?: string | null;
}): Promise<number> {
  const deliveries = await fetchCustodyDeliveries(params.authToken);
  if (!deliveries.length) return 0;
  const accessToken = getCloudAccessTokenFromSession(params.custodianPn);
  if (!accessToken) {
    throw new Error('Connect your cloud storage so you can hold the recovery shares you protect.');
  }
  const keys = await loadIdentityRecoveryKeys(params.custodianIdentityId, params.custodianPublicKey);
  const valid = [];
  for (const d of deliveries) {
    try {
      await openSealedShare(
        parseSealedShare(d.sealedShare),
        keys.secretKey,
        custodyAad({ ownerPublicKey: d.ownerPublicKey, custodianId: d.custodianId, shareIndex: d.shareIndex, epoch: d.epoch })
      );
      valid.push(d);
    } catch {
      console.warn('[recovery] custody delivery could not be opened with this pN; left unacknowledged');
    }
  }
  if (!valid.length) return 0;
  const storedAt = new Date().toISOString();
  await writeRecoveryCustody({
    accessToken,
    pnIdentifier: params.custodianPn,
    entries: valid.map((d) => ({
      ownerPublicKey: d.ownerPublicKey,
      custodianId: d.custodianId,
      shareIndex: d.shareIndex,
      epoch: d.epoch,
      sealedShare: d.sealedShare,
      storedAt,
    })),
  });
  return ackCustodyDeliveries(params.authToken, valid.map((d) => d.deliveryId));
}

/**
 * Approve with a signed proof. Identity recovery also re-seals the held share to the
 * claimant's one-time key, after checking the request id commits to that key.
 */
export async function approveRelayRecoveryRequest(params: {
  authToken: string;
  request: CustodianRecoveryRequest;
  custodianPn: string;
  custodianIdentityId: string;
  custodianEncryptedIdentity: EncryptedIdentity;
}): Promise<{ status: string; approvalCount: number; includesUnrevokableShare: boolean }> {
  const { request } = params;
  let sealedShare: string | undefined;
  if (request.requestType === 'identity_recovery') {
    if (!request.temporaryPublicKey || (await recoveryRequestIdFor(request.temporaryPublicKey)) !== request.requestId) {
      throw new Error('This recovery request does not match its key. Do not approve it.');
    }
    const accessToken = getCloudAccessTokenFromSession(params.custodianPn);
    if (!accessToken) throw new Error('Connect your cloud storage to read the recovery share you hold.');
    const entry = await findRecoveryCustody({
      accessToken,
      pnIdentifier: params.custodianPn,
      custodianId: request.custodianId,
      epoch: request.epoch,
    });
    if (!entry) {
      throw new Error('You do not hold the current recovery share for this pN. Ask the owner to send it again.');
    }
    const keys = await loadIdentityRecoveryKeys(params.custodianIdentityId, params.custodianEncryptedIdentity.publicKey);
    const share = await openSealedShare(
      parseSealedShare(entry.sealedShare),
      keys.secretKey,
      custodyAad({
        ownerPublicKey: request.ownerPublicKey,
        custodianId: request.custodianId,
        shareIndex: request.shareIndex,
        epoch: request.epoch,
      })
    );
    const resealed = await sealShareToKey(
      share,
      request.temporaryPublicKey,
      releaseAad({
        requestId: request.requestId,
        custodianId: request.custodianId,
        shareIndex: request.shareIndex,
        epoch: request.epoch,
      })
    );
    sealedShare = serializeSealedShare(resealed);
  }

  const approvalZkp = await issueRecoveryApprovalZkp({
    identityId: params.custodianIdentityId,
    encryptedIdentity: params.custodianEncryptedIdentity,
    identityPublicKey: request.ownerPublicKey,
    requestId: request.requestId,
    custodianId: request.custodianId,
    shareIndex: request.shareIndex,
  });
  const approval: RecoveryZkApprovalPayload = {
    custodianId: request.custodianId,
    shareIndex: request.shareIndex,
    approvalZkp,
    custodianshipZkp: request.custodianshipCredential,
    approvedAt: new Date().toISOString(),
  };
  return submitRecoveryApproval(params.authToken, request.requestId, {
    custodianId: request.custodianId,
    approval,
    ...(sealedShare ? { sealedShare } : {}),
  });
}

// ---------------------------------------------------------------------------
// Claimant (no pN session)
// ---------------------------------------------------------------------------

export async function startRelayRecovery(params: { recoveryKey: string; claimantContact: string }) {
  const keyHash = await hashRecoveryKey(params.recoveryKey);
  const keyPair = generateRecoveryKeyPair();
  const started = await startRecoveryWithFailsafeKey({
    keyHash,
    temporaryPublicKey: keyPair.publicKey,
    claimantContact: params.claimantContact,
  });
  localStorage.setItem(`${TEMP_KEY_PREFIX}${started.requestId}`, JSON.stringify(keyPair));
  return { ...started, keyHash };
}

/** Read the owner-Drive proof with the claimant's Google token, release, and open the shares. */
export async function finishRelayRecovery(params: {
  requestId: string;
  keyHash: string;
  pnIdentifier: string;
  googleAccessToken: string;
}): Promise<{ shares: ShamirShare[]; envelope: RecoveryEnvelope; publicKey: string }> {
  const raw = localStorage.getItem(`${TEMP_KEY_PREFIX}${params.requestId}`);
  if (!raw) {
    throw new Error('This device does not hold the key for this recovery. Finish on the device where you started.');
  }
  const keyPair = JSON.parse(raw) as RecoveryKeyPair;
  const driveProof = await readClaimantDriveProof(params.googleAccessToken, params.pnIdentifier);
  const released = await releaseRecoveryShares(params.requestId, { keyHash: params.keyHash, driveProof });
  const shares: ShamirShare[] = [];
  for (const s of released.shares) {
    shares.push(
      await openSealedShare(
        parseSealedShare(s.sealedShare),
        keyPair.secretKey,
        releaseAad({ requestId: params.requestId, custodianId: s.custodianId, shareIndex: s.shareIndex, epoch: s.epoch })
      )
    );
  }
  return { shares, envelope: released.envelope, publicKey: released.publicKey };
}

/** Key-only: prove the owner's Google account and release the key envelope (works once). */
export async function finishKeyRecovery(params: {
  requestId: string;
  keyHash: string;
  pnIdentifier: string;
  googleAccessToken: string;
}): Promise<{ keyEnvelope: KeyRecoveryEnvelope; publicKey: string }> {
  const driveProof = await readClaimantDriveProof(params.googleAccessToken, params.pnIdentifier);
  const released = await releaseKeyRecovery(params.requestId, { keyHash: params.keyHash, driveProof });
  return { keyEnvelope: released.keyEnvelope, publicKey: released.publicKey };
}

async function readClaimantDriveProof(accessToken: string, pnIdentifier: string): Promise<string> {
  const driveProof = await readRecoveryDriveProof({ accessToken, pnIdentifier });
  if (!driveProof) {
    throw new Error("This Google account does not hold this pN's recovery proof. Sign in with the account the pN uses.");
  }
  return driveProof;
}

export function clearRelayRecoveryKey(requestId: string): void {
  localStorage.removeItem(`${TEMP_KEY_PREFIX}${requestId}`);
}
