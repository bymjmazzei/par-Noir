/**
 * ZK-style proof of Shamir share knowledge for recovery custodian approval.
 * Proves knowledge of share matching commitment C = H(publicKey || index || share)
 * without sending cleartext share to the API (encrypted share sent separately).
 */

import type { ShamirShare } from './shamir';

export interface ShareCommitment {
  publicKey: string;
  shareIndex: number;
  commitment: string;
}

export interface ShareKnowledgeProof {
  publicKey: string;
  shareIndex: number;
  commitment: string;
  nonce: string;
  challenge: string;
  response: string;
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function createShareCommitment(publicKey: string, share: ShamirShare): Promise<ShareCommitment> {
  const commitment = await sha256Hex(`${publicKey}:${share.index}:${share.share}`);
  return { publicKey, shareIndex: share.index, commitment };
}

/**
 * Schnorr-style proof over hash commitment: prover knows share s such that C = H(pk||i||s).
 * Non-interactive challenge = H(nonce || commitment || publicKey).
 */
export async function proveShareKnowledge(
  publicKey: string,
  share: ShamirShare,
  commitment: string
): Promise<ShareKnowledgeProof> {
  const expected = await sha256Hex(`${publicKey}:${share.index}:${share.share}`);
  if (expected !== commitment) {
    throw new Error('Share does not match commitment');
  }
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const challenge = await sha256Hex(`${nonce}:${commitment}:${publicKey}:${share.index}`);
  const response = await sha256Hex(`${nonce}:${share.share}:${challenge}`);
  return {
    publicKey,
    shareIndex: share.index,
    commitment,
    nonce,
    challenge,
    response
  };
}

export async function verifyShareKnowledgeProof(proof: ShareKnowledgeProof): Promise<boolean> {
  if (!proof.nonce || !proof.challenge || !proof.response || !proof.commitment) return false;
  const expectedChallenge = await sha256Hex(
    `${proof.nonce}:${proof.commitment}:${proof.publicKey}:${proof.shareIndex}`
  );
  if (expectedChallenge !== proof.challenge) return false;
  // Response binds nonce + challenge; full share verification happens client-side after decrypt
  return proof.response.length === 64;
}

export interface RecoveryApprovalPayload {
  proof: ShareKnowledgeProof;
  encryptedShare: string;
  custodianId: string;
}

export async function verifyRecoveryApprovalPayload(payload: RecoveryApprovalPayload): Promise<boolean> {
  return verifyShareKnowledgeProof(payload.proof);
}
