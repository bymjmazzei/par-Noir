import {
  decodeEnvelopeFromProofString,
  isZkProofEnvelopeV2,
  openContractPublicInputsFromEnvelope,
  verifyZkProofEnvelopeV2,
  OPEN_CREATOR_CONTRACT_CONTEXT_V1
} from '@par-noir/zk-protocol-v2';

/** When licensing contracts carry grantProofRef, verify ZKP envelopes before index write. */
export function assertOpenContractProofsOnLicensing(licensing: unknown): string | null {
  if (!licensing || typeof licensing !== 'object') return null;
  const root = licensing as Record<string, unknown>;
  if (root.family !== 'implied') return null;
  const contracts = Array.isArray(root.contracts) ? root.contracts : [];
  for (const c of contracts) {
    if (!c || typeof c !== 'object') continue;
    const proofRef = String((c as { grantProofRef?: string }).grantProofRef || '').trim();
    if (!proofRef) continue;
    try {
      const verified = verifyZkProofEnvelopeV2(proofRef);
      if (!verified.ok) return 'open_contract_proof_invalid';
      const envelope = decodeEnvelopeFromProofString(proofRef);
      if (!isZkProofEnvelopeV2(envelope)) return 'open_contract_proof_invalid';
      if (envelope.context !== OPEN_CREATOR_CONTRACT_CONTEXT_V1) {
        return 'open_contract_proof_context';
      }
      const inputs = openContractPublicInputsFromEnvelope(envelope.public_inputs);
      if (!inputs) return 'open_contract_proof_inputs';
    } catch {
      return 'open_contract_proof_decode';
    }
  }
  return null;
}
