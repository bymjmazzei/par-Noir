import type { PenLicensingRoot, PenOpenCreatorContract } from '@par-noir/pen-protocol';
import {
  OPEN_CREATOR_CONTRACT_CONTEXT_V1,
  buildOpenContractPublicInputs,
  generateZkProofEnvelopeV2
} from '@par-noir/zk-protocol-v2';
import type { PenSession } from '../App';
import { resolveSigningKeys } from './penKeys';

const PERPETUAL_MS = 100 * 365.25 * 24 * 60 * 60 * 1000;

function proofForContract(
  session: PenSession,
  assetId: string,
  ownerPnHash: string,
  contract: PenOpenCreatorContract,
  workLicense: string
): string {
  const keys = resolveSigningKeys(session);
  if (!keys?.secretKey || !keys.publicKey) {
    throw new Error('signing_keys_required');
  }
  const public_inputs = buildOpenContractPublicInputs({
    assetId,
    party: contract.party,
    claimBps: contract.claimBps,
    splits: contract.splits,
    workLicense,
    holderPnHash: contract.splits[0]?.holderPnHash || ownerPnHash,
    expiresAtMs: Date.now() + PERPETUAL_MS
  });
  return generateZkProofEnvelopeV2({
    mlDsaSecretKey: keys.secretKey,
    mlDsaPublicKey: keys.publicKey,
    context: OPEN_CREATOR_CONTRACT_CONTEXT_V1,
    public_inputs,
    expiresAtMs: Date.now() + PERPETUAL_MS
  });
}

/** Attach grantProofRef on implied contracts before publish snapshot. */
export async function attachImpliedContractProofs(
  session: PenSession,
  licensing: PenLicensingRoot,
  assetId: string,
  ownerPnHash: string
): Promise<PenLicensingRoot> {
  if (licensing.family !== 'implied' || !licensing.contracts.length) return licensing;
  const workLicense = licensing.workLicense || 'all-rights-reserved';
  const contracts: PenOpenCreatorContract[] = [];
  for (const c of licensing.contracts) {
    if (c.grantProofRef?.trim()) {
      contracts.push(c);
      continue;
    }
    const grantProofRef = proofForContract(session, assetId, ownerPnHash, c, workLicense);
    contracts.push({ ...c, grantProofRef });
  }
  return { ...licensing, contracts };
}
