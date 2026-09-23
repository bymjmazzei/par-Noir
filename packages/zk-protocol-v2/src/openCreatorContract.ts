/**
 * Open creator contract grant — ZKP public_inputs for zk-protocol-v2 envelopes.
 * Reuses bind-mix STARK + ML-DSA; no dedicated AIR yet.
 */

import { sha3_384 } from '@noble/hashes/sha3.js';
import { bytesToBase64 } from '@par-noir/pqc-crypto/encoding';
import { sortKeysDeep } from './binding.js';

export const OPEN_CREATOR_CONTRACT_CONTEXT_V1 = 'parnoir.open_creator_contract.v1' as const;

export type OpenContractRoyaltyParty = 'content_rights' | 'music';

export interface OpenContractSplitShare {
  holderPnHash: string;
  role: string;
  shareBps: number;
}

export interface OpenContractPublicInputsV1 {
  asset_id: string;
  party: OpenContractRoyaltyParty;
  claim_bps: number;
  splits_commitment: string;
  work_license: string;
  holder_pn_hash: string;
  issued_at_ms: number;
  expires_at_ms: number;
}

/** SHA3-384 of canonical splits JSON, base64. */
export function commitSplits(splits: OpenContractSplitShare[]): string {
  const canonical = JSON.stringify(sortKeysDeep(splits));
  const digest = sha3_384(new TextEncoder().encode(canonical));
  return bytesToBase64(digest);
}

export function buildOpenContractPublicInputs(params: {
  assetId: string;
  party: OpenContractRoyaltyParty;
  claimBps: number;
  splits: OpenContractSplitShare[];
  workLicense: string;
  holderPnHash: string;
  issuedAtMs?: number;
  expiresAtMs: number;
}): OpenContractPublicInputsV1 {
  const claim = Math.max(0, Math.min(10000, Math.round(params.claimBps)));
  const issued = params.issuedAtMs ?? Date.now();
  return {
    asset_id: params.assetId.trim(),
    party: params.party,
    claim_bps: claim,
    splits_commitment: commitSplits(params.splits),
    work_license: params.workLicense.trim(),
    holder_pn_hash: params.holderPnHash.trim(),
    issued_at_ms: issued,
    expires_at_ms: params.expiresAtMs
  };
}

export function isOpenContractPublicInputsV1(x: unknown): x is OpenContractPublicInputsV1 {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.asset_id === 'string' &&
    (o.party === 'content_rights' || o.party === 'music') &&
    typeof o.claim_bps === 'number' &&
    typeof o.splits_commitment === 'string' &&
    typeof o.work_license === 'string' &&
    typeof o.holder_pn_hash === 'string' &&
    typeof o.issued_at_ms === 'number' &&
    typeof o.expires_at_ms === 'number'
  );
}

export function openContractPublicInputsFromEnvelope(
  publicInputs: Record<string, unknown>
): OpenContractPublicInputsV1 | null {
  return isOpenContractPublicInputsV1(publicInputs) ? publicInputs : null;
}
