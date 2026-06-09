import { generateZkProofEnvelopeV2, decodeEnvelopeFromProofString, isZkProofEnvelopeV2 } from '@par-noir/zk-protocol-v2';
import type { IdentityKeyMaterial, ZkpReissueSource } from './types';

const DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export function extractReissueSourceFromEnvelope(zkpProof: string): ZkpReissueSource | null {
  const env = decodeEnvelopeFromProofString(zkpProof);
  if (!isZkProofEnvelopeV2(env)) return null;
  const dataPointId =
    typeof env.public_inputs.data_point_id === 'string'
      ? env.public_inputs.data_point_id
      : typeof env.public_inputs.zkp_type === 'string'
        ? env.public_inputs.zkp_type
        : 'unknown';
  return {
    dataPointId,
    context: env.context,
    publicInputs: { ...env.public_inputs },
    expiresAtMs: env.expires_at_ms,
  };
}

export async function reissueZkProof(
  source: ZkpReissueSource,
  successor: Pick<IdentityKeyMaterial, 'mlDsaSecretKey' | 'mlDsaPublicKey' | 'publicKey'>,
  patchPublicInputs?: Record<string, unknown>
): Promise<string> {
  const public_inputs = {
    ...source.publicInputs,
    ...patchPublicInputs,
  };
  if (public_inputs.identity_public_key !== undefined) {
    public_inputs.identity_public_key = successor.publicKey;
  }
  const expiresAtMs = source.expiresAtMs ?? Date.now() + DEFAULT_TTL_MS;
  return generateZkProofEnvelopeV2({
    mlDsaSecretKey: successor.mlDsaSecretKey,
    mlDsaPublicKey: successor.mlDsaPublicKey,
    context: source.context,
    public_inputs,
    expiresAtMs,
  });
}

export async function reissueZkProofsFromEnvelopes(
  proofs: string[],
  successor: Pick<IdentityKeyMaterial, 'mlDsaSecretKey' | 'mlDsaPublicKey' | 'publicKey'>
): Promise<Array<{ dataPointId: string; proof: string }>> {
  const out: Array<{ dataPointId: string; proof: string }> = [];
  for (const old of proofs) {
    const source = extractReissueSourceFromEnvelope(old);
    if (!source) continue;
    const proof = await reissueZkProof(source, successor);
    out.push({ dataPointId: source.dataPointId, proof });
  }
  return out;
}
